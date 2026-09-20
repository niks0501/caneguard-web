<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Broadcasting\ShouldRescue;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NewCaseSubmitted implements ShouldBroadcast, ShouldRescue
{
    use Dispatchable, SerializesModels;

    public const EVENT_NAME = 'case.submitted';

    public const EVENT_TYPE = 'new_case_submitted';

    /**
     * The queued broadcast must never run before the report transaction commits.
     */
    public bool $afterCommit = true;

    public function __construct(
        public readonly string $recipientUuid,
        public readonly string $reportUuid,
        public readonly string $referenceCode,
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
     * The Web client uses this only to invalidate REST queries.
     *
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'event_type' => self::EVENT_TYPE,
            'domains' => ['reports', 'dashboard', 'notifications'],
        ];
    }
}
