<?php

namespace Tests\MySql;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AuthMySqlSchemaTest extends TestCase
{
    public function test_auth_security_schema_uses_mysql_safe_index_names(): void
    {
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertSame('caneguard_test', DB::connection()->getDatabaseName());

        $userColumn = DB::table('information_schema.columns')
            ->where('table_schema', 'caneguard_test')
            ->where('table_name', 'users')
            ->where('column_name', 'biometric_enabled')
            ->first();

        $this->assertNotNull($userColumn);
        $this->assertSame('tinyint', $userColumn->DATA_TYPE);

        $deviceColumn = DB::table('information_schema.columns')
            ->where('table_schema', 'caneguard_test')
            ->where('table_name', 'personal_access_tokens')
            ->where('column_name', 'device_id')
            ->first();

        $this->assertNotNull($deviceColumn);
        $this->assertSame('varchar', $deviceColumn->DATA_TYPE);
        $this->assertSame(191, (int) $deviceColumn->CHARACTER_MAXIMUM_LENGTH);

        $index = DB::table('information_schema.statistics')
            ->selectRaw(
                'INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns',
            )
            ->where('table_schema', 'caneguard_test')
            ->where('table_name', 'personal_access_tokens')
            ->where('index_name', 'pat_tokenable_device_id_idx')
            ->groupBy('INDEX_NAME')
            ->first();

        $this->assertNotNull($index);
        $this->assertSame('pat_tokenable_device_id_idx', $index->INDEX_NAME);
        $this->assertSame('tokenable_type,tokenable_id,device_id', $index->indexed_columns);
        $this->assertLessThanOrEqual(64, strlen($index->INDEX_NAME));
    }
}
