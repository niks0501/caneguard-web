<?php

namespace App\Models;

use Database\Factories\AdvisoryFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

#[Fillable([
    'uuid',
    'code',
    'title',
    'content',
    'status',
    'validation_provenance',
    'created_by_id',
    'validated_by_id',
    'validated_at',
    'retired_by_id',
    'retired_at',
])]
class Advisory extends Model
{
    public const STATUS_DRAFT = 'draft';

    public const STATUS_VALIDATED = 'validated';

    public const STATUS_RETIRED = 'retired';

    /** Delivery is not available until a case selects this advisory. */
    public const DELIVERY_NOT_SELECTED = 'not_selected';

    public const DELIVERY_PENDING = 'pending';

    public const DELIVERY_DELIVERED = 'delivered';

    public const DELIVERY_ACKNOWLEDGED = 'acknowledged';

    /** @use HasFactory<AdvisoryFactory> */
    use HasFactory, HasUuids;

    protected $dateFormat = 'Y-m-d H:i:s.v';

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /** @return BelongsTo<User, $this> */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    /** @return BelongsTo<User, $this> */
    public function validatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by_id');
    }

    /** @return BelongsTo<User, $this> */
    public function retiredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'retired_by_id');
    }

    /** @return array<int, string> */
    public static function statuses(): array
    {
        return [
            self::STATUS_DRAFT,
            self::STATUS_VALIDATED,
            self::STATUS_RETIRED,
        ];
    }

    public function isDeliverable(): bool
    {
        return $this->status === self::STATUS_VALIDATED;
    }

    /**
     * Apply the locked library state machine and retain who/when validated it.
     * A validated item is immutable content; retirement is terminal.
     */
    public function transitionTo(
        string $status,
        User $actor,
        ?string $provenance = null,
    ): self {
        if (! in_array($status, self::statuses(), true)) {
            throw new LogicException("Unsupported advisory status [{$status}].");
        }

        $current = $this->status ?? self::STATUS_DRAFT;
        if ($current === self::STATUS_RETIRED) {
            throw new LogicException('A retired advisory cannot change state.');
        }

        if ($status === self::STATUS_DRAFT && $current !== self::STATUS_DRAFT) {
            throw new LogicException('A validated advisory cannot return to draft.');
        }

        if ($status === self::STATUS_VALIDATED) {
            if ($current !== self::STATUS_DRAFT) {
                throw new LogicException('Only a draft advisory can be validated.');
            }
            if (blank($provenance)) {
                throw new LogicException('Validation provenance is required.');
            }

            $this->status = self::STATUS_VALIDATED;
            $this->validation_provenance = trim($provenance);
            $this->validated_by_id = $actor->getKey();
            $this->validated_at = now()->utc();
        } elseif ($status === self::STATUS_RETIRED) {
            if ($current !== self::STATUS_VALIDATED) {
                throw new LogicException('Only a validated advisory can be retired.');
            }

            $this->status = self::STATUS_RETIRED;
            $this->retired_by_id = $actor->getKey();
            $this->retired_at = now()->utc();
        }

        return $this;
    }

    protected function casts(): array
    {
        return [
            'validated_at' => 'immutable_datetime',
            'retired_at' => 'immutable_datetime',
        ];
    }
}
