<?php

namespace App\Jobs;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Actions\Reports\RenderWeeklyReport;
use App\Actions\Reports\SendWeeklyReportSmtp;
use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\DistrictRecipientSet;
use App\Models\DistrictReportTransmission;
use App\Models\DistrictReportVersion;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;

/** Single attempt. A crashed delivery is deliberately not automatically resent. */
final class DeliverDistrictReport implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 90;

    public function __construct(public readonly int $intentId) {}

    public function handle(DistrictReportWorkflow $workflow, RenderWeeklyReport $renderer, SendWeeklyReportSmtp $transport): void
    {
        $intent = DistrictReportTransmission::findOrFail($this->intentId);
        $version = DistrictReportVersion::findOrFail($intent->district_report_version_id);
        $claimed = DB::transaction(function () use ($intent, $version, $workflow): bool {
            District::query()->whereKey($version->district_id)->lockForUpdate()->firstOrFail();
            if (! $workflow->checkPending($intent)) {
                return false;
            }
            // Durable claim before external I/O: a duplicate queue delivery sees delivering, not pending.
            $intent->fresh()->update(['state' => 'delivering']);

            return true;
        });
        if (! $claimed) {
            return;
        }
        $version = DistrictReportVersion::findOrFail($intent->district_report_version_id);
        try {
            $bytes = $renderer->approvedBytes($version);
            $recipients = DistrictRecipientSet::findOrFail($intent->district_recipient_set_id)->recipients;
            $receipt = $transport->send($version, $recipients, $bytes, $renderer->filename($version));
            $this->complete($workflow, 'sent', $receipt, null);
        } catch (\Throwable) {
            // Never persist SMTP diagnostics: they may contain credentials or recipient PII.
            $this->complete($workflow, 'failed', null, 'Transport did not confirm acceptance. Check the provider before ordering another send.');
        }
    }

    public function failed(?\Throwable $exception): void
    {
        $this->complete(app(DistrictReportWorkflow::class), 'failed', null, 'Worker stopped without confirming acceptance. Check the provider before ordering another send.');
    }

    private function complete(DistrictReportWorkflow $workflow, string $state, ?string $receipt, ?string $failure): void
    {
        DB::transaction(function () use ($workflow, $state, $receipt, $failure): void {
            $intent = DistrictReportTransmission::query()->lockForUpdate()->findOrFail($this->intentId);
            if (! in_array($intent->state, ['pending', 'delivering'], true)) {
                return;
            }
            $intent->update(['state' => $state, 'transport_receipt' => $receipt, 'failure_reason' => $failure, 'completed_at' => now()->utc()]);
            $workflow->event(DistrictReportVersion::findOrFail($intent->district_report_version_id), $state === 'sent' ? 'delivered' : 'delivery_failed',
                User::findOrFail($intent->requested_by_id), DistrictGrant::findOrFail($intent->send_grant_id), $intent);
        });
    }
}
