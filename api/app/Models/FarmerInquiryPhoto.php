<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FarmerInquiryPhoto extends Model
{
    protected $dateFormat = 'Y-m-d H:i:s.v';

    protected $guarded = [];

    /** @return BelongsTo<FarmerInquiry, $this> */
    public function inquiry(): BelongsTo
    {
        return $this->belongsTo(FarmerInquiry::class, 'farmer_inquiry_id');
    }
}
