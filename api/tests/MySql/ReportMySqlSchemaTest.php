<?php

namespace Tests\MySql;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ReportMySqlSchemaTest extends TestCase
{
    public function test_report_schema_matches_the_mysql_contract(): void
    {
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertSame('caneguard_test', DB::connection()->getDatabaseName());

        $table = DB::table('information_schema.tables')
            ->where('table_schema', 'caneguard_test')
            ->where('table_name', 'reports')
            ->firstOrFail();

        $this->assertSame('InnoDB', $table->ENGINE);
        $this->assertSame('utf8mb4_unicode_ci', $table->TABLE_COLLATION);

        $columns = DB::table('information_schema.columns')
            ->where('table_schema', 'caneguard_test')
            ->where('table_name', 'reports')
            ->get()
            ->keyBy('COLUMN_NAME');

        $this->assertColumn($columns, 'uuid', 'char', 36);
        $this->assertColumn($columns, 'reference_code', 'varchar', 32);
        $this->assertColumn($columns, 'client_uuid', 'char', 36);
        $this->assertColumn($columns, 'barangay', 'varchar', 120);
        $this->assertColumn($columns, 'image_path', 'varchar', 500);
        $this->assertColumn($columns, 'image_mime_type', 'varchar', 100);
        $this->assertColumn($columns, 'image_source_type', 'varchar', 20);
        $this->assertColumn($columns, 'predicted_label', 'varchar', 32);
        $this->assertColumn($columns, 'review_status', 'varchar', 40);
        $this->assertDecimal($columns, 'confidence', 8, 7);
        $this->assertDecimal($columns, 'preprocess_ms', 12, 3);
        $this->assertDecimal($columns, 'inference_ms', 12, 3);
        $this->assertDecimal($columns, 'total_ms', 12, 3);
        $this->assertDateTime($columns, 'captured_at', 3);
        $this->assertDateTime($columns, 'submitted_at', 3);
        $this->assertDateTime($columns, 'reviewed_at', 3);
        $this->assertDateTime($columns, 'created_at', 0);
        $this->assertDateTime($columns, 'updated_at', 0);
        $this->assertSame('bigint', $columns->get('lock_version')->DATA_TYPE);
        $this->assertStringContainsString(
            'unsigned',
            $columns->get('lock_version')->COLUMN_TYPE,
        );
        $this->assertSame('0', $columns->get('lock_version')->COLUMN_DEFAULT);
        $this->assertStringContainsString(
            'unsigned',
            $columns->get('image_size_bytes')->COLUMN_TYPE,
        );

        $indexes = DB::table('information_schema.statistics')
            ->selectRaw(
                'INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns',
            )
            ->where('table_schema', 'caneguard_test')
            ->where('table_name', 'reports')
            ->groupBy('INDEX_NAME', 'NON_UNIQUE')
            ->get()
            ->keyBy('INDEX_NAME');

        $this->assertIndex(
            $indexes,
            'reports_uuid_unique',
            'uuid',
            unique: true,
        );
        $this->assertIndex(
            $indexes,
            'reports_reference_code_unique',
            'reference_code',
            unique: true,
        );
        $this->assertIndex(
            $indexes,
            'reports_reporter_id_client_uuid_unique',
            'reporter_id,client_uuid',
            unique: true,
        );
        $this->assertIndex(
            $indexes,
            'reports_submitted_at_index',
            'submitted_at',
        );
        $this->assertIndex(
            $indexes,
            'reports_review_status_submitted_at_index',
            'review_status,submitted_at',
        );
        $this->assertIndex(
            $indexes,
            'reports_predicted_label_submitted_at_index',
            'predicted_label,submitted_at',
        );
        $this->assertIndex(
            $indexes,
            'reports_barangay_submitted_at_index',
            'barangay,submitted_at',
        );
        $this->assertIndex(
            $indexes,
            'reports_reporter_id_updated_at_index',
            'reporter_id,updated_at',
        );

        $foreignKeys = DB::table('information_schema.key_column_usage')
            ->where('table_schema', 'caneguard_test')
            ->where('table_name', 'reports')
            ->whereNotNull('referenced_table_name')
            ->get()
            ->keyBy('COLUMN_NAME');

        $this->assertSame(
            'users',
            $foreignKeys->get('reporter_id')->REFERENCED_TABLE_NAME,
        );
        $this->assertSame(
            'users',
            $foreignKeys->get('reviewer_id')->REFERENCED_TABLE_NAME,
        );

        $deleteRules = DB::table('information_schema.referential_constraints')
            ->where('constraint_schema', 'caneguard_test')
            ->where('table_name', 'reports')
            ->pluck('DELETE_RULE', 'CONSTRAINT_NAME');

        $this->assertSame(
            'RESTRICT',
            $deleteRules->get('reports_reporter_id_foreign'),
        );
        $this->assertSame(
            'SET NULL',
            $deleteRules->get('reports_reviewer_id_foreign'),
        );

        $childPrimaryKeys = [
            'report_class_scores' => 'report_id,label',
            'report_symptoms' => 'report_id,symptom_key',
            'report_quality_warnings' => 'report_id,warning_key',
        ];

        foreach ($childPrimaryKeys as $childTable => $primaryColumns) {
            $rule = DB::table('information_schema.referential_constraints')
                ->where('constraint_schema', 'caneguard_test')
                ->where('table_name', $childTable)
                ->value('DELETE_RULE');

            $this->assertSame('CASCADE', $rule);

            $primaryKey = DB::table('information_schema.statistics')
                ->selectRaw(
                    'GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns',
                )
                ->where('table_schema', 'caneguard_test')
                ->where('table_name', $childTable)
                ->where('index_name', 'PRIMARY')
                ->value('indexed_columns');

            $this->assertSame($primaryColumns, $primaryKey);
        }

        $scoreColumn = DB::table('information_schema.columns')
            ->where('table_schema', 'caneguard_test')
            ->where('table_name', 'report_class_scores')
            ->where('column_name', 'score')
            ->firstOrFail();
        $symptomColumn = DB::table('information_schema.columns')
            ->where('table_schema', 'caneguard_test')
            ->where('table_name', 'report_symptoms')
            ->where('column_name', 'symptom_key')
            ->firstOrFail();
        $warningColumn = DB::table('information_schema.columns')
            ->where('table_schema', 'caneguard_test')
            ->where('table_name', 'report_quality_warnings')
            ->where('column_name', 'warning_key')
            ->firstOrFail();

        $this->assertSame('decimal', $scoreColumn->DATA_TYPE);
        $this->assertSame(8, (int) $scoreColumn->NUMERIC_PRECISION);
        $this->assertSame(7, (int) $scoreColumn->NUMERIC_SCALE);
        $this->assertSame('varchar', $symptomColumn->DATA_TYPE);
        $this->assertSame(50, (int) $symptomColumn->CHARACTER_MAXIMUM_LENGTH);
        $this->assertSame('varchar', $warningColumn->DATA_TYPE);
        $this->assertSame(50, (int) $warningColumn->CHARACTER_MAXIMUM_LENGTH);

        $mode = DB::selectOne('SELECT @@SESSION.sql_mode AS sql_mode');
        $timezone = DB::selectOne('SELECT @@SESSION.time_zone AS time_zone');

        $this->assertMatchesRegularExpression(
            '/STRICT_(TRANS_TABLES|ALL_TABLES)/',
            $mode->sql_mode,
        );
        $this->assertSame('+00:00', $timezone->time_zone);
    }

    /**
     * @param  Collection<string, object>  $columns
     */
    private function assertColumn(
        Collection $columns,
        string $name,
        string $type,
        int $length,
    ): void {
        $column = $columns->get($name);

        $this->assertNotNull($column, "Missing column [{$name}].");
        $this->assertSame($type, $column->DATA_TYPE);
        $this->assertSame($length, (int) $column->CHARACTER_MAXIMUM_LENGTH);
        $this->assertSame('utf8mb4_unicode_ci', $column->COLLATION_NAME);
    }

    /**
     * @param  Collection<string, object>  $columns
     */
    private function assertDecimal(
        Collection $columns,
        string $name,
        int $precision,
        int $scale,
    ): void {
        $column = $columns->get($name);

        $this->assertNotNull($column, "Missing column [{$name}].");
        $this->assertSame('decimal', $column->DATA_TYPE);
        $this->assertSame($precision, (int) $column->NUMERIC_PRECISION);
        $this->assertSame($scale, (int) $column->NUMERIC_SCALE);
    }

    /**
     * @param  Collection<string, object>  $columns
     */
    private function assertDateTime(
        Collection $columns,
        string $name,
        int $precision,
    ): void {
        $column = $columns->get($name);

        $this->assertNotNull($column, "Missing column [{$name}].");
        $this->assertSame('datetime', $column->DATA_TYPE);
        $this->assertSame($precision, (int) $column->DATETIME_PRECISION);
    }

    /**
     * @param  Collection<string, object>  $indexes
     */
    private function assertIndex(
        Collection $indexes,
        string $name,
        string $columns,
        bool $unique = false,
    ): void {
        $index = $indexes->get($name);

        $this->assertNotNull($index, "Missing index [{$name}].");
        $this->assertSame($columns, $index->indexed_columns);
        $this->assertSame($unique ? 0 : 1, (int) $index->NON_UNIQUE);
    }
}
