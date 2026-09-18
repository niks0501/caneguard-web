<?php

namespace App\Actions\Notifications;

use App\Events\CaseAttentionChanged;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Throwable;

class BroadcastCaseAttentionChanged
{
    public function handle(User $recipient, string $eventType): void
    {
        if (! $recipient->isOfficeUser()) {
            return;
        }

        try {
            event(new CaseAttentionChanged($recipient->uuid, $eventType));
        } catch (Throwable $exception) {
            Log::warning('Case attention real-time invalidation could not be queued.', [
                'recipient_uuid' => $recipient->uuid,
                'event_type' => $eventType,
                'failure_type' => $exception::class,
            ]);
        }
    }

    public function handleOfficeUsers(string $eventType): void
    {
        User::query()
            ->whereIn('role', User::officeRoles())
            ->get()
            ->each(function (User $recipient) use ($eventType): void {
                $this->handle($recipient, $eventType);
            });
    }
}
