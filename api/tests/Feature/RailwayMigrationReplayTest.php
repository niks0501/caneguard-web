<?php

namespace Tests\Feature;

use App\Support\MigrationReplay;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class RailwayMigrationReplayTest extends TestCase
{
    private const TARGETS = [
        '2026_09_26_000000_make_referral_reference_optional_and_add_tracking_code.php',
        '2026_10_04_000002_add_district_access.php',
        '2026_10_04_000003_add_district_report_versions.php',
        '2026_10_05_000001_seal_weekly_report_artifacts.php',
        '2026_10_05_000002_add_account_access_management.php',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        // No shared database, inherited .env URL, or launch bootstrap may enter this suite.
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:', 'database.connections.sqlite.url' => null]);
        DB::purge('sqlite');
    }

    public function test_clean_forward_sequence_and_repeated_pending_migration_up_preserve_constraints(): void
    {
        foreach (glob(database_path('migrations/*.php')) as $file) {
            $migration = require $file;
            $migration->up();
            if (in_array(basename($file), self::TARGETS, true)) {
                $migration->up();
            }
        }
        $this->assertTrue(Schema::hasIndex('district_grants', 'district_grants_active_approver_district_unique', 'unique'));
        $this->assertTrue(Schema::hasIndex('district_report_transmissions', 'district_transmission_version_index'));
        $this->assertFalse(Schema::hasIndex('district_report_transmissions', 'district_report_transmissions_district_report_version_id_unique'));
        $this->assertSame(0, DB::table('districts')->count());
        $this->assertSame(0, DB::table('district_memberships')->count());
        $this->assertSame(0, DB::table('district_grants')->count());
    }

    public static function interruptionPoints(): array
    {
        return [
            'tracking column before unique' => [self::TARGETS[0], 'add column "tracking_code"', 'report_referrals_tracking_code_unique', 'report_referrals'],
            'district create before unique' => [self::TARGETS[1], 'create table "districts"', 'districts_code_unique', 'districts'],
            'report district column before FK/index' => [self::TARGETS[1], 'add column "district_id"', 'reports_district_id_submitted_at_index', 'reports'],
            'report versions before constraints' => [self::TARGETS[2], 'create table "district_report_versions"', 'district_week_version_unique', 'district_report_versions'],
            'seal lineage before FK' => [self::TARGETS[3], 'add column "supersedes_version_id"', 'district_transmission_version_index', 'district_report_transmissions'],
            'seal index before drop uniqueness' => [self::TARGETS[3], '"district_transmission_version_index"', 'district_transmission_version_index', 'district_report_transmissions'],
            'account revision before other DDL' => [self::TARGETS[4], 'add column "access_version"', 'users_created_at_id_index', 'users'],
            'singleton column before unique' => [self::TARGETS[4], 'add column "active_approver_district"', 'district_grants_active_approver_district_unique', 'district_grants'],
            'receipt table before constraints' => [self::TARGETS[4], 'create table "account_access_receipts"', 'account_receipt_key', 'account_access_receipts'],
        ];
    }

    #[DataProvider('interruptionPoints')]
    public function test_pending_migration_recovers_after_a_completed_ddl_statement(string $target, string $needle, string $index, string $table): void
    {
        foreach (glob(database_path('migrations/*.php')) as $file) {
            if (basename($file) === $target) {
                break;
            }
            (require $file)->up();
        }
        $interrupted = false;
        DB::listen(function (QueryExecuted $query) use ($needle, &$interrupted): void {
            if (! $interrupted && str_contains(strtolower($query->sql), $needle)) {
                $interrupted = true;
                throw new RuntimeException('Simulated process loss after DDL applied');
            }
        });
        $migration = require database_path('migrations/'.$target);
        try {
            $migration->up();
            $this->fail('The requested completed DDL interruption did not fire');
        } catch (RuntimeException $error) {
            $this->assertSame('Simulated process loss after DDL applied', $error->getMessage());
        }
        $migration->up();
        $this->assertTrue($interrupted);
        $this->assertTrue(Schema::hasIndex($table, $index));
        if ($target === self::TARGETS[3]) {
            $this->assertFalse(Schema::hasIndex('district_report_transmissions', 'district_report_transmissions_district_report_version_id_unique'));
        }
    }

    public function test_account_singleton_check_still_refuses_contradictory_legacy_authority(): void
    {
        foreach (glob(database_path('migrations/*.php')) as $file) {
            if (basename($file) === self::TARGETS[4]) {
                break;
            }
            (require $file)->up();
        }
        // Synthetic authority only in this private in-memory test, never a seed path.
        Schema::disableForeignKeyConstraints();
        DB::table('district_grants')->insert([
            ['user_id' => 1, 'district_id' => 1, 'ability' => 'report:approve'],
            ['user_id' => 2, 'district_id' => 1, 'ability' => 'report:approve'],
        ]);
        Schema::enableForeignKeyConstraints();
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Multiple active report approvers require approved operator reconciliation');
        (require database_path('migrations/'.self::TARGETS[4]))->up();
    }

    public function test_incomplete_existing_create_table_fails_closed_instead_of_accepting_unrelated_drift(): void
    {
        Schema::create('districts', fn (Blueprint $table) => $table->id());
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Incomplete districts schema requires approved forward recovery');
        (require database_path('migrations/'.self::TARGETS[1]))->up();
    }

    public function test_existing_wrong_index_is_not_silently_accepted_as_a_unique_authority_constraint(): void
    {
        Schema::create('drift_probe', function (Blueprint $table): void {
            $table->id();
            $table->string('code');
            $table->index('id', 'drift_probe_code_unique');
        });
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Unexpected constraint drift_probe_code_unique');
        MigrationReplay::index('drift_probe', ['code'], 'drift_probe_code_unique', true);
    }

    public function test_september_24_guard_and_short_indexes_survive_replay(): void
    {
        foreach (glob(database_path('migrations/*.php')) as $file) {
            if (basename($file) === '2026_09_24_000000_create_report_referral_symptom_findings_table.php') {
                $migration = require $file;
                $migration->up();
                $migration->up();
                break;
            }
            (require $file)->up();
        }
        $this->assertTrue(Schema::hasIndex('report_referral_symptom_findings', 'rrsf_referral_symptom_unique', 'unique'));
        $this->assertTrue(Schema::hasIndex('report_referral_symptom_findings', 'rrsf_symptom_verdict_index'));
    }
}
