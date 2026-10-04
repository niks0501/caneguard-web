<?php

namespace Tests\MySql;

use App\Models\Report;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class StaffCertificationMigrationMySqlTest extends TestCase
{
    public function test_additive_migration_preserves_legacy_accounts_cases_tokens_and_evidence_but_requires_roster_certification(): void
    {
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/^(caneguard_test|firstmate_[a-z0-9_]+)$/D', DB::connection()->getDatabaseName());
        $this->assertDatabaseCount('staff_invitations', 0);
        $user = User::factory()->fieldReporter()->create();
        $report = Report::factory()->create(['reporter_id' => $user->id]);
        $token = $user->createToken('legacy-inspector', ['*'])->plainTextToken;
        $before = $report->fresh()->getAttributes();

        // Exercise upgrade against populated legacy schema, not just an empty DB.
        $migration = require database_path('migrations/2026_10_04_000002_add_staff_certification_and_invitations.php');
        $migration->down();
        $migration->up();

        $legacy = $user->fresh();
        $this->assertSame(User::ROLE_FIELD_REPORTER, $legacy->role);
        $this->assertNull($legacy->staff_certified_at);
        $this->assertFalse($legacy->isFieldReporter());
        $this->assertSame($before, $report->fresh()->getAttributes());
        $this->assertTrue(Hash::check('password', $legacy->password));
        $this->withToken($token)->getJson('/api/v1/mobile/reports/statuses')->assertForbidden();
        $this->assertSame(1, $legacy->tokens()->count());
    }
}
