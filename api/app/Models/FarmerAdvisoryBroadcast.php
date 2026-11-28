<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class FarmerAdvisoryBroadcast extends Model
{
    use HasUuids;

    public const DEFAULT_DAYS = 14;

    public const MAX_DAYS = 60;

    protected $dateFormat = 'Y-m-d H:i:s.v';

    protected $guarded = [];

    protected $casts = ['barangays' => 'array', 'published_at' => 'datetime', 'expires_at' => 'datetime', 'retired_at' => 'datetime'];

    protected static function booted(): void
    {
        static::saved(function (FarmerAdvisoryBroadcast $broadcast): void {
            if ($broadcast->wasRecentlyCreated || $broadcast->wasChanged('barangays')) {
                $broadcast->syncTargetBarangays();
            }
        });
    }

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function syncTargetBarangays(): void
    {
        if (! Schema::hasTable('farmer_advisory_broadcast_barangays')) {
            return;
        }

        DB::table('farmer_advisory_broadcast_barangays')
            ->where('broadcast_id', $this->getKey())
            ->delete();

        if (! is_array($this->barangays) || $this->barangays === []) {
            return;
        }

        $targets = array_values(array_unique(array_filter(
            $this->barangays,
            fn (mixed $value): bool => is_string($value) && $value !== '',
        )));

        if ($targets === []) {
            return;
        }

        DB::table('farmer_advisory_broadcast_barangays')->insertOrIgnore(
            array_map(fn (string $barangay): array => [
                'broadcast_id' => $this->getKey(),
                'barangay' => $barangay,
            ], $targets),
        );
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

    /**
     * Filter broadcasts addressed to a farmer's home barangay (plus all-barangay
     * broadcasts) in SQL before pagination or row limits are applied.
     *
     * @param  Builder<FarmerAdvisoryBroadcast>  $query
     */
    public function scopeForBarangay(Builder $query, ?string $barangay): void
    {
        if ($barangay === null || $barangay === '') {
            $query->whereNull('barangays');

            return;
        }

        $query->where(function (Builder $scope) use ($barangay): void {
            $scope->whereNull('barangays')
                ->orWhereExists(function (QueryBuilder $subquery) use ($barangay): void {
                    $subquery->selectRaw('1')
                        ->from('farmer_advisory_broadcast_barangays')
                        ->whereColumn('farmer_advisory_broadcast_barangays.broadcast_id', 'farmer_advisory_broadcasts.id')
                        ->where('farmer_advisory_broadcast_barangays.barangay', $barangay);
                });
        });
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
