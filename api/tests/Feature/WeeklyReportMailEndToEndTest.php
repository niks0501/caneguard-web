<?php

namespace Tests\Feature;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Models\DistrictGrant;
use App\Models\DistrictRecipientSet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\FakeSmtpMailbox;
use Tests\TestCase;

/**
 * Real transport, fake mailbox: the approved weekly report travels through the database queue and the
 * TLS-required `weekly_smtp` mailer into a local STARTTLS server that stores, and relays, nothing.
 */
class WeeklyReportMailEndToEndTest extends TestCase
{
    use FakeSmtpMailbox;
    use RefreshDatabase;

    protected function tearDown(): void
    {
        $this->stopFakeMailbox();
        parent::tearDown();
    }

    public function test_queued_report_reaches_fake_mailbox_over_verified_tls_with_approved_pdf(): void
    {
        $this->startFakeMailbox('weekly_smtp');
        config(['caneguard.weekly_send_enabled' => true, 'queue.default' => 'database']);

        $district = $this->pilotDistrict();
        $officer = User::factory()->admin()->inDistrict($district)->create();
        foreach (['report:approve', 'report:send'] as $ability) {
            DistrictGrant::query()->create(['user_id' => $officer->id, 'district_id' => $district->id, 'ability' => $ability]);
        }
        DistrictRecipientSet::query()->create(['district_id' => $district->id, 'recipients' => ['dummy@example.test'], 'office_reference' => 'synthetic-test-contract']);
        $workflow = app(DistrictReportWorkflow::class);
        $version = $workflow->prepare($officer, '2026-W40');
        $version = $workflow->approve($officer, $version, $version->content_hash);
        $intent = $workflow->requestSend($officer, $version, $version->content_hash, (string) Str::uuid());

        // Queued, not sent inline: the intent waits on the database queue until a worker runs.
        $this->assertSame('pending', $intent->fresh()->state);
        $this->assertSame(1, DB::table('jobs')->count());
        $this->assertSame([], $this->fakeMailboxMessages());

        Artisan::call('queue:work', ['connection' => 'database', '--once' => true, '--tries' => 1]);

        $intent = $intent->fresh();
        $this->assertSame('sent', $intent->state, (string) $intent->failure_reason);
        $this->assertNotEmpty($intent->transport_receipt);
        $messages = $this->fakeMailboxMessages();
        $this->assertCount(1, $messages);
        $raw = file_get_contents($messages[0]);
        $this->assertSame(['dummy@example.test'], $this->fakeMailboxEnvelopeRecipients($messages[0]));
        $this->assertStringContainsString('X-CaneGuard-Version: '.$version->uuid, $raw);
        $this->assertStringContainsString('application/pdf', $raw);
        $this->assertSame(0, DB::table('jobs')->count());
    }
}
