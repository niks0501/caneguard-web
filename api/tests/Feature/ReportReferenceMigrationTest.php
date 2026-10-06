<?php

namespace Tests\Feature;

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

class ReportReferenceMigrationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:', 'database.connections.sqlite.url' => null]);
        DB::purge('sqlite');
        Schema::create('reports', function (Blueprint $table): void {
            $table->id();
            $table->string('reference_code', 32)->unique();
        });
    }

    public function test_widen_and_replay_preserve_existing_references_and_uniqueness(): void
    {
        $legacy = 'BGO-20260702-0915';
        DB::table('reports')->insert(['reference_code' => $legacy]);
        $migration = $this->migration();
        $migration->up();
        $migration->up(); // Completed DDL may replay before Laravel records its ledger entry.

        $namespaced = 'DEMO-NAS-20261006-'.$legacy;
        $this->assertSame(35, strlen($namespaced));
        DB::table('reports')->insert(['reference_code' => $namespaced]);
        DB::table('reports')->insert(['reference_code' => str_repeat('R', 64)]);
        $this->assertSame([$legacy, $namespaced, str_repeat('R', 64)], DB::table('reports')->orderBy('id')->pluck('reference_code')->all());
        $this->assertTrue(Schema::hasIndex('reports', 'reports_reference_code_unique', 'unique'));

        $this->expectException(QueryException::class);
        DB::table('reports')->insert(['reference_code' => $namespaced]);
    }

    public static function longReferences(): array
    {
        return [
            'deployment reference' => ['DEMO-NAS-20261006-BGO-20260702-0915'],
            'column boundary' => [str_repeat('R', 64)],
            'multibyte characters' => [str_repeat('ñ', 33)],
        ];
    }

    #[DataProvider('longReferences')]
    public function test_rollback_refuses_long_references_without_changing_rows_or_constraints(string $reference): void
    {
        $migration = $this->migration();
        $migration->up();
        DB::table('reports')->insert(['reference_code' => $reference]);
        $before = Schema::getColumns('reports');

        try {
            $migration->down();
            $this->fail('Expected rollback refusal before schema changes.');
        } catch (RuntimeException $error) {
            $this->assertStringContainsString('Report references exceed 32 characters', $error->getMessage());
        }

        $this->assertSame($before, Schema::getColumns('reports'));
        $this->assertSame($reference, DB::table('reports')->sole()->reference_code);
        $this->assertTrue(Schema::hasIndex('reports', 'reports_reference_code_unique', 'unique'));
    }

    public function test_safe_rollback_and_reapply_preserve_32_character_multibyte_reference(): void
    {
        $reference = str_repeat('ñ', 32);
        DB::table('reports')->insert(['reference_code' => $reference]);
        $migration = $this->migration();
        $migration->up();
        $migration->down();
        $migration->up();

        $this->assertSame($reference, DB::table('reports')->sole()->reference_code);
        $this->assertTrue(Schema::hasIndex('reports', 'reports_reference_code_unique', 'unique'));
        $this->expectException(QueryException::class);
        DB::table('reports')->insert(['reference_code' => null]);
    }

    private function migration(): Migration
    {
        return require database_path('migrations/2026_10_06_000001_widen_report_reference_code.php');
    }
}
