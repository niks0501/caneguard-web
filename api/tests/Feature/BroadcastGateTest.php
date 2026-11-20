<?php

namespace Tests\Feature;

use App\Events\CaseAttentionChanged;
use App\Events\NewCaseSubmitted;
use Illuminate\Broadcasting\BroadcastEvent;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class BroadcastGateTest extends TestCase
{
    public function test_null_broadcast_connection_queues_no_broadcast_job(): void
    {
        config(['broadcasting.default' => 'null']);
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
