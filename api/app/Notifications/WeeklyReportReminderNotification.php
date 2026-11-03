<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/** In-app prompt to prepare or approve last week's report. It never prepares, approves or sends. */
class WeeklyReportReminderNotification extends Notification
{
    public const EVENT_TYPE = 'weekly_report_reminder';

    public const STATE_NOT_PREPARED = 'not_prepared';

    public const STATE_AWAITING_APPROVAL = 'awaiting_approval';

    /** @param  string  $week  ISO week such as 2026-W44 */
    public function __construct(
        string $recipientUuid,
        public readonly string $week,
        public readonly string $state,
    ) {
        $this->id = NotificationId::for($recipientUuid, 'weekly-report-reminder|'.$week);
    }

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toDatabase(object $notifiable): array
    {
        $label = 'W'.substr($this->week, -2);
        $prepared = $this->state === self::STATE_AWAITING_APPROVAL;

        return [
            'event_type' => self::EVENT_TYPE,
            'title' => $prepared ? "Week {$label} awaiting approval" : "Week {$label} not prepared",
            'message' => $prepared
                ? "The weekly report for {$label} is prepared but not approved yet."
                : "The weekly report for {$label} has not been prepared yet.",
            'report_uuid' => null,
            'reference_code' => null,
            'assignment_uuid' => null,
            'week' => $this->week,
            'state' => $this->state,
        ];
    }
}
