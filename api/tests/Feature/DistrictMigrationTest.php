<?php

namespace Tests\Feature;

use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DistrictMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_forward_access_migration_revokes_credentials_without_inferred_authority_or_history_changes(): void
    {
        $weekly = require database_path('migrations/2026_10_04_000003_add_district_report_versions.php');
        $access = require database_path('migrations/2026_10_04_000002_add_district_access.php');
        $weekly->down();
        $access->down();
        $inspector = User::factory()->create(['remember_token' => 'legacy-test-remember-token']);
        $retired = User::factory()->create(['role' => 'disabled']);
        $report = Report::factory()->create(['reporter_id' => $inspector->id, 'reviewer_id' => $retired->id, 'review_notes' => 'Preserved historic attribution.']);
        $legacyToken = $inspector->createToken('legacy');
        DB::table('personal_access_tokens')->where('id', $legacyToken->accessToken->id)->update(['expires_at' => null]);
        DB::table('sessions')->insert(['id' => 'synthetic-session', 'user_id' => $inspector->id, 'payload' => '', 'last_activity' => time()]);
        $identity = [$inspector->uuid, $inspector->role, $inspector->email_verified_at->toISOString()];
        $access->up();
        $weekly->up();
        $inspector->refresh();
        $this->assertSame($identity, [$inspector->uuid, $inspector->role, $inspector->email_verified_at->toISOString()]);
        $this->assertNull($inspector->remember_token);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseCount('sessions', 0);
        $this->assertDatabaseCount('districts', 0);
        $this->assertDatabaseCount('district_memberships', 0);
        $this->assertDatabaseCount('district_grants', 0);
        $this->assertDatabaseCount('district_recipient_sets', 0);
        $this->assertNull($report->fresh()->district_id);
        $this->assertSame($inspector->id, $report->fresh()->reporter_id);
        $this->assertSame($retired->id, $report->fresh()->reviewer_id);
        $this->assertSame('disabled', $retired->fresh()->role);
        $this->assertSame('Preserved historic attribution.', $report->fresh()->review_notes);
    }
}
