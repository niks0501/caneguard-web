<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A farmer's opt-in request for the office to look at a plant. Never a report. */
class FarmerInquiry extends Model
{
    use HasUuids;

    public const STATUS_NEW = 'new';

    public const STATUS_REVIEWING = 'reviewing';

    public const STATUS_REPLIED = 'replied';

    /** One-tap concerns the phone offers instead of free typing. */
    public const CONCERNS = ['spreading', 'changed_since_last', 'new_leaves', 'want_to_be_sure'];

    public const MAX_PHOTOS = 2;

    protected $dateFormat = 'Y-m-d H:i:s.v';

    protected $guarded = [];

    protected $casts = ['reviewed_at' => 'datetime', 'replied_at' => 'datetime', 'lock_version' => 'integer'];

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /** @return BelongsTo<User, $this> */
    public function farmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_id');
    }

    /** @return HasMany<FarmerInquiryPhoto, $this> */
    public function photos(): HasMany
    {
        return $this->hasMany(FarmerInquiryPhoto::class)->orderBy('position');
    }

    /** @return HasMany<FarmerInquiryReply, $this> */
    public function replies(): HasMany
    {
        return $this->hasMany(FarmerInquiryReply::class)->orderBy('id');
    }
}
