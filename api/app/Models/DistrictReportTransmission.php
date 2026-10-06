<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DistrictReportTransmission extends Model
{
    protected $guarded = [];

    protected $hidden = ['send_grant_id', 'send_grant_revision'];

    protected static function booted(): void
    {
        static::updating(function (self $intent): void {
            $allowed = ['state', 'transport_receipt', 'failure_reason', 'completed_at', 'updated_at'];
            $transitions = ['pending' => ['delivering', 'cancelled', 'failed'], 'delivering' => ['sent', 'failed']];
            if (array_diff(array_keys($intent->getDirty()), $allowed) !== []
                || ! in_array($intent->state, $transitions[$intent->getOriginal('state')] ?? [], true)) {
                throw new \LogicException('Send bindings and completed receipts are immutable.');
            }
        });
        static::deleting(fn () => throw new \LogicException('Delivery history cannot be deleted.'));
    }

    protected function casts(): array
    {
        return ['completed_at' => 'datetime'];
    }
}
