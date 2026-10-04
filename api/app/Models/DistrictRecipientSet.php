<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['district_id', 'recipients', 'office_reference', 'revoked_at'])]
class DistrictRecipientSet extends Model
{
    protected function casts(): array
    {
        return ['recipients' => 'array', 'revoked_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::creating(function (self $set): void {
            if (trim((string) $set->office_reference) === '' || ! is_array($set->recipients) || $set->recipients === []) {
                throw new \InvalidArgumentException('An office-approved nonempty recipient set is required.');
            }
            foreach ($set->recipients as $email) {
                if (! is_string($email) || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                    throw new \InvalidArgumentException('Recipient addresses must be valid.');
                }
            }
        });
        static::updating(function (self $set): void {
            if ($set->getOriginal('revoked_at') !== null
                || array_diff(array_keys($set->getDirty()), ['revoked_at', 'updated_at']) !== []) {
                throw new \LogicException('Recipient sets are immutable; revoke and create a new set.');
            }
        });
        static::deleting(fn () => throw new \LogicException('Recipient history cannot be deleted.'));
    }
}
