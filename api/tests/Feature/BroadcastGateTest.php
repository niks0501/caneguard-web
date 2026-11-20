<?php

namespace Tests\Feature;

use App\Events\CaseAttentionChanged;
use App\Events\NewCaseSubmitted;
use Illuminate\Broadcasting\BroadcastEvent;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class BroadcastGateTest extends TestCase
{
    /**
     * @return array<string, array{0: string|null}>
     */
    public static function disabledConnections(): array
    {
        return [
            'string null' => ['null'],
            'php null' => [null],
        ];
    }

    #[DataProvider('disabledConnections')]
    public function test_null_broadcast_connection_queues_no_broadcast_job(?string $connection): void
    {
        config(['broadcasting.default' => $connection]);
        Queue::fake();

        NewCaseSubmitted::dispatch('recipient-uuid', 'report-uuid', 'CG-0001');
        CaseAttentionChanged::dispatch('recipient-uuid', 'case_needs_attention');

        Queue::assertNothingPushed();
    }

    public function test_configured_broadcast_connection_still_queues_both_events(): void
    {
        config(['broadcasting.default' => 'log']);
        Queue::fake();

        NewCaseSubmitted::dispatch('recipient-uuid', 'report-uuid', 'CG-0001');
        CaseAttentionChanged::dispatch('recipient-uuid', 'case_needs_attention');

        Queue::assertPushed(BroadcastEvent::class, 2);
    }
}
