<?php

namespace Tests\Feature;

use App\Models\ReportReferral;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExpertPhaseThreeTest extends TestCase
{
    use RefreshDatabase;

    public function test_signed_consult_invite_is_redacted_counted_and_revocable(): void
    {
        Storage::fake('local');
        $reviewer = User::factory()->reviewer()->create();
        $consult = ReportReferral::factory()->create();
        $report = $consult->report;
        Storage::disk('local')->put($report->image_path, 'evidence');
        Sanctum::actingAs($reviewer);

        $issue = $this->postJson("/api/v1/reports/{$report->uuid}/referral/invite")
            ->assertCreated()
            ->assertJsonPath('data.share_full_context', false);
        $inviteUrl = $issue->json('data.url');
        $photoUrl = $issue->json('data.photo_url');
        $this->assertIsString($inviteUrl);
        $this->assertStringStartsWith('/api/v1/consult-invites/', $inviteUrl);
        $this->assertIsString($photoUrl);
        $this->assertStringStartsWith('/api/v1/consult-invites/', $photoUrl);
        $this->get($photoUrl)->assertOk();

        $this->getJson($inviteUrl)
            ->assertOk()
            ->assertJsonMissingPath('data.farmer_or_farm_owner_name')
            ->assertJsonMissingPath('data.location.latitude')
            ->assertJsonMissingPath('data.location.longitude')
            ->assertJsonMissingPath('data.office_context')
            ->assertJsonPath('data.case.reference_code', $report->reference_code)
            ->assertJsonPath('data.photo_url', fn ($url) => is_string($url) && str_starts_with(
                $url,
                '/api/v1/consult-invites/',
            ));
        $this->getJson($inviteUrl)->assertOk();
        $this->assertSame(3, $consult->fresh()->invite_access_count);

        $this->deleteJson("/api/v1/reports/{$report->uuid}/referral/invite")
            ->assertOk()
            ->assertJsonPath('data.revoked_at', fn ($value) => is_string($value));
        $this->assertNotNull($consult->fresh()->invite_revoked_at);
        $this->getJson($inviteUrl)->assertForbidden();
        $this->get($photoUrl)->assertForbidden();
        $this->assertSame(3, $consult->fresh()->invite_access_count);
    }

    public function test_in_system_expert_packet_and_summary_apply_the_same_redaction(): void
    {
        $expert = User::factory()->expert()->create();
        $consult = ReportReferral::factory()->assignedToExpert($expert)->create();
        $consult->report->update([
            'farmer_or_farm_owner_name' => 'Private farm owner',
            'final_latitude' => 14.12,
            'final_longitude' => 120.45,
        ]);
        Sanctum::actingAs($expert);

        $this->getJson("/api/v1/reports/{$consult->report->uuid}/consult")
            ->assertOk()
            ->assertJsonMissingPath('data.farmer_or_farm_owner_name')
            ->assertJsonMissingPath('data.location.latitude')
            ->assertJsonMissingPath('data.location.longitude');
        $this->getJson("/api/v1/reports/{$consult->report->uuid}/referral/summary")
            ->assertOk()
            ->assertJsonMissingPath('data.farmer_or_farm_owner_name')
            ->assertJsonMissingPath('data.location.latitude')
            ->assertJsonMissingPath('data.location.longitude');

        $consult->update(['share_full_context' => true]);
        $this->getJson("/api/v1/reports/{$consult->report->uuid}/consult")
            ->assertJsonPath('data.farmer_or_farm_owner_name', 'Private farm owner')
            ->assertJsonPath('data.location.latitude', 14.12)
            ->assertJsonPath('data.location.longitude', 120.45);
    }

    public function test_full_context_is_scoped_to_one_consult(): void
    {
        $reviewer = User::factory()->reviewer()->create();
        $shared = ReportReferral::factory()->create([
            'share_full_context' => true,
        ]);
        $private = ReportReferral::factory()->create([
            'share_full_context' => false,
        ]);
        $shared->report->update([
            'farmer_or_farm_owner_name' => 'Shared farm owner',
            'final_latitude' => 14.12,
            'final_longitude' => 120.45,
        ]);
        $private->report->update([
            'farmer_or_farm_owner_name' => 'Private farm owner',
            'final_latitude' => 15.12,
            'final_longitude' => 121.45,
        ]);
        Sanctum::actingAs($reviewer);

        $sharedUrl = $this->postJson("/api/v1/reports/{$shared->report->uuid}/referral/invite")
            ->assertCreated()
            ->json('data.url');
        $privateUrl = $this->postJson("/api/v1/reports/{$private->report->uuid}/referral/invite")
            ->assertCreated()
            ->json('data.url');

        $this->getJson($sharedUrl)
            ->assertJsonPath('data.farmer_or_farm_owner_name', 'Shared farm owner')
            ->assertJsonPath('data.location.latitude', 14.12)
            ->assertJsonPath('data.location.longitude', 120.45);
        $this->getJson($privateUrl)
            ->assertJsonMissingPath('data.farmer_or_farm_owner_name')
            ->assertJsonMissingPath('data.location.latitude')
            ->assertJsonMissingPath('data.location.longitude');
    }

    public function test_active_referral_view_is_due_sorted_and_excludes_terminal_consults(): void
    {
        CarbonImmutable::setTestNow('2026-09-24 09:00:00');
        try {
            $reviewer = User::factory()->reviewer()->create();
            $expert = User::factory()->expert()->create();
            $soon = ReportReferral::factory()->assignedToExpert($expert)->create([
                'referral_date' => '2026-09-20',
                'due_date' => '2026-09-25',
            ]);
            $late = ReportReferral::factory()->assignedToExpert($expert)->create([
                'referral_date' => '2026-09-20',
                'due_date' => '2026-09-30',
            ]);
            ReportReferral::factory()->create([
                'consult_status' => ReportReferral::STATUS_COMPLETED,
            ]);
            Sanctum::actingAs($reviewer);

            $this->getJson('/api/v1/reports?referral=active')
                ->assertOk()
                ->assertJsonPath('meta.total', 2)
                ->assertJsonPath('data.0.uuid', $soon->report->uuid)
                ->assertJsonPath('data.0.expert_consult.expert_name', $expert->name)
                ->assertJsonPath('data.0.expert_consult.due_date', '2026-09-25')
                ->assertJsonPath('data.0.expert_consult.days_out', 4)
                ->assertJsonPath('data.0.expert_consult.overdue', false)
                ->assertJsonPath('data.1.uuid', $late->report->uuid);
        } finally {
            CarbonImmutable::setTestNow();
        }
    }
}
