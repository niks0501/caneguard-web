<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class CaseAttentionChanged implements ShouldBroadcast, ShouldRescue
{
    use Dispatchable, SerializesModels;

    public const EVENT_NAME = 'case.attention_changed';

    public bool $afterCommit = true;

    public function __construct(
        public readonly string $recipientUuid,
        public readonly string $eventType,
    ) {}

    /**
     * @return array<int, PrivateChannel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel("users.{$this->recipientUuid}")];
    }

    public function broadcastAs(): string
    {
        return self::EVENT_NAME;
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'event_type' => $this->eventType,
            'domains' => ['reports', 'dashboard', 'field-validation', 'notifications'],
        ];
    }
}
