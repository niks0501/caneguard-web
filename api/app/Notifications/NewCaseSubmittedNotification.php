<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

class NewCaseSubmittedNotification extends Notification
{
    public const EVENT_TYPE = 'new_case_submitted';

    public function __construct(
        public readonly string $reportUuid,
        public readonly string $referenceCode,
    ) {}

    /**
     * Store the attention item immediately with the case transaction.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toDatabase(object $notifiable): array
    {
        return [
            'event_type' => self::EVENT_TYPE,
            'title' => 'New case ready for review',
            'message' => "{$this->referenceCode} was submitted and is ready for review.",
            'report_uuid' => $this->reportUuid,
            'reference_code' => $this->referenceCode,
        ];
    }
}
