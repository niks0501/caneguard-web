<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'report_referral_id',
    'symptom_key',
    'verdict',
    'note',
])]
class ReportReferralSymptomFinding extends Model
{
    public const VERDICTS = ['present', 'absent', 'unsure'];

    /** @return BelongsTo<ReportReferral, $this> */
    public function referral(): BelongsTo
    {
        return $this->belongsTo(ReportReferral::class, 'report_referral_id');
    }
}
