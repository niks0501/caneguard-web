<?php

namespace Tests\Feature;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Actions\Reports\RenderWeeklyReport;
use App\Actions\Reports\SendWeeklyReportSmtp;
use App\Jobs\DeliverDistrictReport;
use App\Models\DistrictGrant;
use App\Models\DistrictRecipientSet;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Tests\TestCase;

class DeliverDistrictReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        config(['caneguard.weekly_send_enabled' => true]);
    }

    public function test_explicit_intent_delivers_only_approved_bytes_and_records_provider_receipt_once(): void
    {
        [$officer, $version, $intent] = $this->intent();
        $transport = Mockery::mock(SendWeeklyReportSmtp::class);
        $transport->shouldReceive('send')->once()->withArgs(function ($sentVersion, $recipients, $bytes, $filename) use ($version): bool {
            return $sentVersion->id === $version->id && $recipients === ['dummy@example.test']
                && hash('sha256', $bytes) === $version->document_sha256 && str_ends_with($filename, '-2026-W40-v1.pdf');
        })->andReturn('smtp-provider-message@example.test');
        $job = new DeliverDistrictReport($intent->id);
        $job->handle(app(DistrictReportWorkflow::class), app(RenderWeeklyReport::class), $transport);
        $job->handle(app(DistrictReportWorkflow::class), app(RenderWeeklyReport::class), $transport);
        $this->assertSame('sent', $intent->fresh()->state);
        $this->assertSame('smtp-provider-message@example.test', $intent->fresh()->transport_receipt);
        $this->assertNotNull($intent->fresh()->completed_at);
        $this->assertDatabaseHas('district_report_events', ['action' => 'delivered', 'actor_id' => $officer->id, 'grant_id' => $intent->send_grant_id, 'grant_revision' => $intent->send_grant_revision, 'recipient_set_id' => $intent->district_recipient_set_id]);
        $same = app(DistrictReportWorkflow::class)->requestSend($officer, $version, $version->content_hash, $intent->idempotency_key);
        $this->assertSame($intent->id, $same->id);
    }

    public function test_failure_is_sanitized_and_retry_requires_a_new_explicit_order(): void
    {
        [$officer, $version, $intent] = $this->intent();
        $transport = Mockery::mock(SendWeeklyReportSmtp::class);
        $transport->shouldReceive('send')->once()->andThrow(new \RuntimeException('SMTP secret=password recipient=private@example.test'));
        (new DeliverDistrictReport($intent->id))->handle(app(DistrictReportWorkflow::class), app(RenderWeeklyReport::class), $transport);
        $this->assertSame('failed', $intent->fresh()->state);
        $this->assertStringNotContainsString('secret', $intent->fresh()->failure_reason);
        $this->assertNull($intent->fresh()->transport_receipt);
        $this->assertDatabaseHas('district_report_events', ['action' => 'delivery_failed']);
        $workflow = app(DistrictReportWorkflow::class);
        $this->assertSame($intent->id, $workflow->requestSend($officer, $version, $version->content_hash, $intent->idempotency_key)->id);
        $retry = $workflow->requestSend($officer, $version, $version->content_hash, (string) Str::uuid());
        $this->assertNotSame($intent->id, $retry->id);
        $this->assertSame('pending', $retry->state);
        $this->assertSame(1, (new DeliverDistrictReport($retry->id))->tries);
    }

    public static function changes(): array
    {
        return array_map(fn ($change) => [$change], ['gate', 'recipient', 'sender', 'approver', 'source']);
    }

    #[DataProvider('changes')]
    public function test_worker_rechecks_closed_gate_revoked_recipients_grants_and_changed_evidence(string $change): void
    {
        [$officer, $version, $intent] = $this->intent();
        if ($change === 'gate') {
            config(['caneguard.weekly_send_enabled' => false]);
        }
        if ($change === 'recipient') {
            DistrictRecipientSet::findOrFail($intent->district_recipient_set_id)->update(['revoked_at' => now()]);
        }
        if ($change === 'sender') {
            DistrictGrant::findOrFail($intent->send_grant_id)->update(['revoked_at' => now()]);
        }
        if ($change === 'approver') {
            DistrictGrant::findOrFail($version->approved_grant_id)->update(['revoked_at' => now()]);
        }
        if ($change === 'source') {
            Report::factory()->inDistrict($this->pilotDistrict())->create(['submitted_at' => '2026-09-29 10:00:00']);
        }
        $transport = Mockery::mock(SendWeeklyReportSmtp::class);
        $transport->shouldNotReceive('send');
        (new DeliverDistrictReport($intent->id))->handle(app(DistrictReportWorkflow::class), app(RenderWeeklyReport::class), $transport);
        $this->assertSame('cancelled', $intent->fresh()->state, $change);
    }

    public function test_durable_in_progress_claim_is_never_automatically_resent(): void
    {
        [, , $intent] = $this->intent();
        $intent->update(['state' => 'delivering']);
        $transport = Mockery::mock(SendWeeklyReportSmtp::class);
        $transport->shouldNotReceive('send');
        (new DeliverDistrictReport($intent->id))->handle(app(DistrictReportWorkflow::class), app(RenderWeeklyReport::class), $transport);
        $this->assertSame('delivering', $intent->fresh()->state);
    }

    public function test_worker_timeout_records_uncertainty_without_leaking_diagnostics(): void
    {
        [, , $intent] = $this->intent();
        $intent->update(['state' => 'delivering']);
        (new DeliverDistrictReport($intent->id))->failed(new \RuntimeException('secret transport details'));
        $this->assertSame('failed', $intent->fresh()->state);
        $this->assertStringContainsString('Check the provider', $intent->fresh()->failure_reason);
        $this->assertStringNotContainsString('secret', $intent->fresh()->failure_reason);
    }

    public function test_completed_receipt_and_intent_bindings_are_immutable(): void
    {
        [, , $intent] = $this->intent();
        $intent->update(['state' => 'failed']);
        $this->expectException(\LogicException::class);
        $intent->update(['state' => 'pending']);
    }

    public function test_dedicated_smtp_requires_encryption_and_does_not_inherit_log_default(): void
    {
        $this->assertSame('smtp', config('mail.mailers.weekly_smtp.transport'));
        $this->assertTrue(config('mail.mailers.weekly_smtp.require_tls'));
        $transport = Mail::mailer('weekly_smtp')->getSymfonyTransport();
        $this->assertInstanceOf(EsmtpTransport::class, $transport);
        $this->assertTrue($transport->isTlsRequired());
    }

    private function intent(): array
    {
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

        return [$officer, $version, $intent];
    }
}
