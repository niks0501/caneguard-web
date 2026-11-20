<?php

namespace App\Events\Concerns;

/**
 * Laravel queues a ShouldBroadcast event for every driver, the null driver
 * included, so BROADCAST_CONNECTION=null alone still fills the jobs table.
 * The event is still dispatched, but with no broadcaster configured
 * broadcastWhen() is false and Laravel does not queue its broadcast.
 */
trait BroadcastsOnlyWhenEnabled
{
    public function broadcastWhen(): bool
    {
        return ! in_array(config('broadcasting.default'), [null, 'null'], true);
    }
}
