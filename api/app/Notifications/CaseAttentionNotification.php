<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

abstract class CaseAttentionNotification extends Notification
{
    public function __construct(
        string $recipientUuid,
        public readonly string $reportUuid,
        public readonly string $referenceCode,
        public readonly string $eventType,
        public readonly string $title,
        public readonly string $message,
        public readonly ?string $assignmentUuid,
        string $dedupeKey,
    ) {
        $this->id = NotificationId::for($recipientUuid, $dedupeKey);
    }

    /**
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
            'event_type' => $this->eventType,
            'title' => $this->title,
            'message' => $this->message,
            'report_uuid' => $this->reportUuid,
            'reference_code' => $this->referenceCode,
            'assignment_uuid' => $this->assignmentUuid,
            ...$this->additionalData(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function additionalData(): array
    {
        return [];
    }
}
