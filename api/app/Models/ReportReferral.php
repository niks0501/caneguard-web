<?php

namespace App\Models;

use Database\Factories\ReportReferralFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'report_id',
    'referred_by_id',
    'destination',
    'reference',
    'referral_date',
    'note',
    'response_date',
    'response_note',
    'response_finding',
    'response_recorded_by_id',
    'response_recorded_at',
    'office_case_state',
    'office_verification_outcome',
    'office_field_validation_state',
    'office_action_taken',
    'office_authority_classified_condition',
    'office_review_notes',
    'office_reviewer_id',
    'office_reviewed_at',
])]
class ReportReferral extends Model
{
    /** @use HasFactory<ReportReferralFactory> */
    use HasFactory;

    protected $dateFormat = 'Y-m-d H:i:s.v';

    /**
     * @return BelongsTo<Report, $this>
     */
    public function report(): BelongsTo
    {
        return $this->belongsTo(Report::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function referredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'referred_by_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function responseRecordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'response_recorded_by_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function officeReviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'office_reviewer_id');
    }

    protected function casts(): array
    {
        return [
            'referral_date' => 'date:Y-m-d',
            'response_date' => 'date:Y-m-d',
            'response_recorded_at' => 'immutable_datetime',
            'office_reviewed_at' => 'immutable_datetime',
        ];
    }
}
