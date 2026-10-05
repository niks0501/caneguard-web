<?php

namespace Tests\Feature;

use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PDO;
use RuntimeException;
use Tests\TestCase;

/** Explicit opt-in: creates one fresh local firstmate_ test database; never connects to app .env DB. */
class RailwayMySqlReplayTest extends TestCase
{
    public function test_mysql_nontransactional_ddl_recovers_before_constraints_and_keeps_launch_authority_empty(): void
    {
        if (getenv('CANEGUARD_REPLAY_LOCAL_MYSQL') !== '1') {
            $this->markTestSkipped('Opt in with CANEGUARD_REPLAY_LOCAL_MYSQL=1 and FIRSTMATE_DEV_DB_* credentials.');
        }
        $host = getenv('FIRSTMATE_DEV_DB_HOST');
        $port = getenv('FIRSTMATE_DEV_DB_PORT');
        $user = getenv('FIRSTMATE_DEV_DB_USER');
        $password = getenv('FIRSTMATE_DEV_DB_PASSWORD');
        $this->assertNotFalse($host);
        $this->assertNotFalse($port);
        $this->assertNotFalse($user);
        $this->assertNotFalse($password);
        $database = 'firstmate_caneguard_replay_'.bin2hex(random_bytes(6));
        $pdo = new PDO("mysql:host={$host};port={$port};charset=utf8mb4", $user, $password, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec("CREATE DATABASE `{$database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        config(['database.default' => 'mysql', 'database.connections.mysql' => [
            'driver' => 'mysql', 'host' => $host, 'port' => $port,
            'database' => $database, 'username' => $user, 'password' => $password,
            'charset' => 'utf8mb4', 'collation' => 'utf8mb4_unicode_ci', 'prefix' => '', 'strict' => true,
        ]]);
        DB::purge('mysql');
        $points = [
            '2026_09_26_000000_make_referral_reference_optional_and_add_tracking_code.php' => 'add `tracking_code`',
            '2026_10_04_000002_add_district_access.php' => 'create table `district_memberships`',
            '2026_10_04_000003_add_district_report_versions.php' => 'create table `district_report_versions`',
            '2026_10_05_000001_seal_weekly_report_artifacts.php' => 'add `supersedes_version_id`',
            '2026_10_05_000002_add_account_access_management.php' => 'add `active_approver_district`',
            '2026_10_06_000000_create_railway_demo_seed_runs.php' => 'create table `railway_demo_seed_runs`',
        ];
        $needle = null;
        $interrupted = false;
        DB::listen(function (QueryExecuted $query) use (&$needle, &$interrupted): void {
            if ($needle !== null && ! $interrupted && str_contains(strtolower($query->sql), $needle)) {
                $interrupted = true;
                throw new RuntimeException('Simulated process loss after MySQL DDL applied');
            }
        });
        foreach (glob(database_path('migrations/*.php')) as $file) {
            $migration = require $file;
            $needle = $points[basename($file)] ?? null;
            $interrupted = false;
            if ($needle === null) {
                $migration->up();

                continue;
            }
            try {
                $migration->up();
                $this->fail('Requested MySQL interruption did not fire');
            } catch (RuntimeException $error) {
                $this->assertSame('Simulated process loss after MySQL DDL applied', $error->getMessage());
            }
            $this->assertTrue($interrupted);
            $migration->up();
            $migration->up();
        }
        $this->assertTrue(Schema::hasIndex('district_grants', 'district_grants_active_approver_district_unique', 'unique'));
        $this->assertTrue(Schema::hasIndex('district_report_transmissions', 'district_transmission_version_index'));
        $this->assertFalse(Schema::hasIndex('district_report_transmissions', 'district_report_transmissions_district_report_version_id_unique'));
        $this->assertNotEmpty(Schema::getForeignKeys('district_memberships'));
        $this->assertNotEmpty(Schema::getForeignKeys('district_report_versions'));
        foreach (['districts', 'district_memberships', 'district_grants', 'users', 'reports'] as $table) {
            $this->assertSame(0, DB::table($table)->count());
        }
        // Left as an isolated empty development schema, no destructive cleanup.
    }
}
