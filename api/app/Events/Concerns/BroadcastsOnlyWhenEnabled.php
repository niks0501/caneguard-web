<?php

namespace App\Events\Concerns;

/**
 * Laravel queues a ShouldBroadcast event for every driver, the null driver
 * included, so BROADCAST_CONNECTION=null alone still fills the jobs table.
 * With no broadcaster configured the event is not dispatched at all.
 */
trait BroadcastsOnlyWhenEnabled
{
    public function broadcastWhen(): bool
    {
        return ! in_array(config('broadcasting.default'), [null, '', 'null'], true);
    }
}
