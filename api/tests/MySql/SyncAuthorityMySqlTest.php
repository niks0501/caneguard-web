<?php

namespace Tests\MySql;

use App\Contracts\MobileReportUploadV2Contract;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SyncAuthorityMySqlTest extends TestCase
{
    use DatabaseTransactions;

    public function test_future_evidence_precise_coordinates_groups_and_reviewed_replay_on_mysql(): void
    {
        $this->assertSame('mysql', DB::connection()->getDriverName());
        $this->assertMatchesRegularExpression('/^firstmate_[a-z0-9_]+$/D', DB::connection()->getDatabaseName());
        Storage::fake('local');
        $reporter = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
        $token = $reporter->createToken('sync-authority-mysql', ['report:submit'])->plainTextToken;
        $clientUuid = fake()->uuid();
        $image = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', strict: true);
        $payload = [
            'client_uuid' => $clientUuid,
            'image' => UploadedFile::fake()->createWithContent('leaf.png', $image),
            'image_source_type' => 'camera',
            'predicted_label' => 'rust',
            'confidence' => 0.7,
            'class_scores' => ['alpha' => 0.1, 'beta' => 0.2, 'gamma' => 0.3, 'delta' => 0.4, str_repeat('x', 32) => 0.7],
            'symptom_keys' => ['rust'],
            'checklist_consistency' => 'consistent',
            'barangay' => 'Sync MySQL fixture',
            'model_version' => str_repeat('v', 100),
            'preprocess_ms' => 1,
            'inference_ms' => 2,
            'total_ms' => 3,
            'captured_at' => '2026-10-05T02:30:00Z',
            'observed_at' => '2026-10-05T02:30:00Z',
            'final_latitude' => 14.1234567,
            'final_longitude' => 120.7654321,
            'location_source' => 'gps',
            'gps_accuracy' => 3,
        ];
        $this->withToken($token)->withHeader('Accept', 'application/json')->post('/api/v2/mobile/reports', $payload)
            ->assertCreated()->assertJsonCount(5, 'data.model.class_scores');
        $report = Report::query()->where('client_uuid', $clientUuid)->sole();
        $this->assertSame(14.1234567, (float) $report->final_latitude);
        $this->assertSame(120.7654321, (float) $report->final_longitude);
        $this->assertSame($this->pilotDistrict()->id, $report->district_id);
        $report->update(['review_status' => Report::STATUS_UNABLE_TO_VERIFY, 'review_notes' => 'Office decision', 'lock_version' => 6]);
        $before = $report->fresh()->getAttributes();
        $authority = MobileReportUploadV2Contract::definition()['authority'];
        $spoofs = array_fill_keys(array_merge($authority['server_owned_read_only'], $authority['server_derived']), 'spoofed');
        $this->withToken($token)->post('/api/v2/mobile/reports', array_replace($payload, $spoofs))
            ->assertOk()->assertJsonPath('data.review.status', Report::STATUS_UNABLE_TO_VERIFY);
        $this->assertSame($before, $report->fresh()->getAttributes());
        $this->assertSame(1, Report::query()->where('reporter_id', $reporter->id)->where('client_uuid', $clientUuid)->count());
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Sync MySQL fixture', 'final_latitude' => 14.1236367, 'final_longitude' => 120.7654321,
        ]);
        Auth::forgetGuards();
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $this->withoutToken()->actingAs($reviewer, 'web')->getJson('/api/v1/reports/map?barangay=Sync%20MySQL%20fixture')
            ->assertOk()->assertJsonCount(2, 'features')
            ->assertJsonPath('features.0.properties.location_group_key', $report->uuid)
            ->assertJsonPath('features.1.properties.location_group_size', 2)
            ->assertJsonPath('features.1.properties.location_group_coordinates', [120.7654321, 14.1234567]);
    }
}
