<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FarmerAdvisoryBroadcast extends Model
{
    use HasUuids;

    public const DEFAULT_DAYS = 14;

    public const MAX_DAYS = 60;

    protected $dateFormat = 'Y-m-d H:i:s.v';

    protected $guarded = [];

    protected $casts = ['barangays' => 'array', 'published_at' => 'datetime', 'expires_at' => 'datetime', 'retired_at' => 'datetime'];

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    /** @return BelongsTo<Advisory, $this> */
    public function advisory(): BelongsTo
    {
        // Archived advisories stay readable so the office can still see what was broadcast.
        return $this->belongsTo(Advisory::class)->withTrashed();
    }

    /** @return BelongsTo<User, $this> */
    public function publisher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'published_by_id');
    }

    /**
     * What farmers may see: not withdrawn, not expired, and still built on a
     * validated, library-resident advisory, so retiring or archiving an advisory
     * hides its broadcasts at once.
     *
     * @param  Builder<FarmerAdvisoryBroadcast>  $query
     */
    public function scopeLive(Builder $query): void
    {
        $query->whereNull('retired_at')->where('expires_at', '>', now())
            ->whereHas('advisory', fn (Builder $advisory) => $advisory->where('status', Advisory::STATUS_VALIDATED)->whereNull('deleted_at'));
    }

    public function isLive(): bool
    {
        return $this->retired_at === null && $this->expires_at->isFuture()
            && $this->advisory?->status === Advisory::STATUS_VALIDATED
            && ! $this->advisory->trashed();
    }

    /** Whether a farmer in this barangay is addressed. A farmer with no home barangay only receives all-barangay broadcasts. */
    public function reaches(?string $barangay): bool
    {
        return $this->barangays === null || ($barangay !== null && in_array($barangay, $this->barangays, true));
    }
}
