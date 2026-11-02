<?php

namespace Tests\Feature;

use App\Contracts\MobileNotificationContract;
use App\Models\District;
use App\Models\DistrictReportVersion;
use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WeeklyReportReminderTest extends TestCase
{
    use RefreshDatabase;

    private District $district;

    private User $admin;

    private User $reviewer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->district = $this->pilotDistrict();
        $this->admin = User::factory()->admin()->inDistrict($this->district)->create();
        $this->reviewer = User::factory()->reviewer()->inDistrict($this->district)->create();
        User::factory()->fieldReporter()->inDistrict($this->district)->create();
        User::factory()->admin()->inDistrict($this->district)->create(['is_active' => false]);
        // Tuesday 13:30 Asia/Manila.
        DB::table('district_reporting_settings')->insert([
            'district_id' => $this->district->id, 'reminder_day' => 2, 'reminder_time' => '13:30',
            'office_reference' => 'synthetic-office-decision', 'updated_by_id' => $this->admin->id, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function at(string $manila): void
    {
        Carbon::setTestNow(Carbon::parse($manila, 'Asia/Manila'));
    }

    private function run15(): void
    {
        Artisan::call('reports:send-weekly-reminders');
    }

    private function version(?string $approvedAt, int $version = 1): void
    {
        $content = ['contract' => 'weekly-report-content-v1'];
        DistrictReportVersion::query()->create([
            'district_id' => $this->district->id, 'week_start' => '2026-10-26', 'version' => $version, 'content' => $content,
            'content_hash' => hash('sha256', json_encode($content).$version), 'source_refs' => [], 'prepared_by_id' => $this->admin->id,
            'approved_by_id' => $approvedAt ? $this->admin->id : null, 'approved_at' => $approvedAt,
            'document_sha256' => $approvedAt ? hash('sha256', 'x') : null, 'document_bytes' => $approvedAt ? base64_encode('x') : null,
        ]);
    }

    public function test_fires_once_per_week_for_each_active_office_user_when_not_prepared(): void
    {
        $this->at('2026-11-03 13:29:00');
        $this->run15();
        $this->assertDatabaseCount('notifications', 0);

        $this->at('2026-11-03 13:30:00');
        $this->run15();
        $this->assertDatabaseCount('notifications', 2);
        foreach ([$this->admin, $this->reviewer] as $user) {
            $data = $user->notifications()->firstOrFail()->data;
            $this->assertSame('weekly_report_reminder', $data['event_type']);
            $this->assertSame('2026-W44', $data['week']);
            $this->assertSame('Week W44 not prepared', $data['title']);
        }

        $this->at('2026-11-03 13:45:00');
        $this->run15();
        $this->at('2026-11-04 09:00:00');
        $this->run15();
        $this->assertDatabaseCount('notifications', 2);

        $this->at('2026-11-10 13:30:00');
        $this->run15();
        $this->assertDatabaseCount('notifications', 4);
        $this->assertSame(['2026-W44', '2026-W45'], $this->admin->notifications()->orderBy('created_at')->get()->pluck('data.week')->sort()->values()->all());
    }

    public function test_wording_is_awaiting_approval_when_prepared_but_unapproved(): void
    {
        $this->version(null);
        $this->at('2026-11-03 14:00:00');
        $this->run15();
        $this->assertSame('Week W44 awaiting approval', $this->admin->notifications()->firstOrFail()->data['title']);
    }

    public function test_silent_when_the_current_version_is_approved(): void
    {
        $this->version('2026-11-02 09:00:00');
        $this->at('2026-11-03 14:00:00');
        $this->run15();
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_a_newer_unapproved_version_supersedes_an_older_approval(): void
    {
        $this->version('2026-11-02 09:00:00');
        $this->version(null, 2);
        $this->at('2026-11-03 14:00:00');
        $this->run15();
        $this->assertDatabaseCount('notifications', 2);
    }

    public function test_silent_without_saved_schedule_and_off_slot_days(): void
    {
        $this->at('2026-11-02 14:00:00');
        $this->run15();
        $this->at('2026-11-05 14:00:00');
        $this->run15();
        $this->assertDatabaseCount('notifications', 0);
        DB::table('district_reporting_settings')->delete();
        $this->at('2026-11-03 14:00:00');
        $this->run15();
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_uses_manila_time_not_utc(): void
    {
        // 05:30 UTC Tuesday is 13:30 Manila.
        Carbon::setTestNow(Carbon::parse('2026-11-03 05:30:00', 'UTC'));
        $this->run15();
        $this->assertDatabaseCount('notifications', 2);
    }

    public function test_command_is_scheduled_every_fifteen_minutes(): void
    {
        $event = collect(app(Schedule::class)->events())->first(fn ($e) => str_contains($e->command, 'reports:send-weekly-reminders'));
        $this->assertNotNull($event);
        $this->assertSame('*/15 * * * *', $event->expression);
    }

    public function test_reminders_appear_in_the_web_and_mobile_feeds_under_the_contract(): void
    {
        $this->at('2026-11-03 13:30:00');
        $this->run15();
        $id = $this->reviewer->notifications()->firstOrFail()->id;

        $this->actingAs($this->reviewer, 'web')->getJson('/api/v1/notifications')->assertOk()
            ->assertJsonPath('data.0.id', $id)->assertJsonPath('data.0.event_type', 'weekly_report_reminder')
            ->assertJsonPath('data.0.case.uuid', null)->assertJsonPath('meta.unread_count', 1);

        $web = $this->actingAs($this->reviewer, 'web')->getJson('/api/v1/notifications')->json('data.0');
        $this->assertSame(array_keys(MobileNotificationContract::definition()['fields']), array_keys($web));

        // The mobile feed is inspector-only: reminders never reach a field reporter.
        $inspector = User::query()->where('role', User::ROLE_FIELD_REPORTER)->firstOrFail();
        $token = $inspector->createToken('notification-read', ['notification:read'])->plainTextToken;
        Auth::forgetGuards();
        $this->withToken($token)->getJson('/api/v1/mobile/notifications')->assertOk()->assertJsonCount(0, 'data');
    }
}
