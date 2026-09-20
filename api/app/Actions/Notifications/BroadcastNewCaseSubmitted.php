<?php

namespace App\Actions\Notifications;

use App\Events\NewCaseSubmitted;
use App\Models\Report;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Throwable;

class BroadcastNewCaseSubmitted
{
    public function handle(Report $report): void
    {
        User::query()
            ->whereIn('role', User::officeRoles())
            ->get(['uuid'])
            ->each(function (User $recipient) use ($report): void {
                try {
                    event(new NewCaseSubmitted(
                        $recipient->uuid,
                        $report->uuid,
                        $report->reference_code,
                    ));
                } catch (Throwable $exception) {
                    Log::warning('New case real-time invalidation could not be queued.', [
                        'report_uuid' => $report->uuid,
                        'recipient_uuid' => $recipient->uuid,
                        'failure_type' => $exception::class,
                    ]);
                }
            });
    }
}
