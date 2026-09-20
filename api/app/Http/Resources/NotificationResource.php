<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Notifications\DatabaseNotification;

/** @mixin DatabaseNotification */
class NotificationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $data = is_array($this->data) ? $this->data : [];

        return [
            'id' => $this->id,
            'event_type' => $data['event_type'] ?? $this->type,
            'title' => $data['title'] ?? 'CaneGuard notification',
            'message' => $data['message'] ?? '',
            'case' => [
                'uuid' => $data['report_uuid'] ?? null,
                'reference_code' => $data['reference_code'] ?? null,
            ],
            'assignment_uuid' => $data['assignment_uuid'] ?? null,
            'content' => $data['content'] ?? null,
            'advisory' => $data['advisory'] ?? null,
            'is_read' => $this->read_at !== null,
            'read_at' => $this->read_at?->utc()->toISOString(),
            'created_at' => $this->created_at?->utc()->toISOString(),
        ];
    }
}
