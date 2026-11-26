<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FarmerInquiryReply extends Model
{
    use HasUuids;

    public const KIND_ADVICE = 'advice';

    public const KIND_NOTE = 'note';

    protected $dateFormat = 'Y-m-d H:i:s.v';

    protected $guarded = [];

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    /** @return BelongsTo<FarmerInquiry, $this> */
    public function inquiry(): BelongsTo
    {
        return $this->belongsTo(FarmerInquiry::class, 'farmer_inquiry_id');
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }
}
