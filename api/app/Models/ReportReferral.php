<?php

namespace App\Models;

use Database\Factories\ReportReferralFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'report_id',
    'referred_by_id',
    'expert_id',
    'destination',
    'reference',
    'referral_date',
    'note',
    'response_date',
    'response_note',
    'response_finding',
    'response_recorded_by_id',
    'response_recorded_at',
    'consult_status',
    'status',
    'due_date',
    'expert_name',
    'expert_contact',
    'finding_summary',
    'condition_opinion',
    'symptom_verdicts',
    'finding_details',
    'finding_confidence',
    'finding_recommendation',
    'finding_source',
    'source',
    'finding_recorded_by_id',
    'finding_recorded_at',
    'office_case_state',
    'office_verification_outcome',
    'office_field_validation_state',
    'office_action_taken',
    'office_authority_classified_condition',
    'office_review_notes',
    'office_reviewer_id',
    'office_reviewed_at',
    'consult_review_outcome',
    'consult_review_note',
    'consult_reviewed_by_id',
    'consult_reviewed_at',
])]
class ReportReferral extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_CANCELLED = 'cancelled';

    public const FINDING_SOURCE_IN_SYSTEM = 'in_system';

    public const FINDING_SOURCE_TRANSCRIBED = 'transcribed';

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
    public function expert(): BelongsTo
    {
        return $this->belongsTo(User::class, 'expert_id');
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
    public function findingRecordedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'finding_recorded_by_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function officeReviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'office_reviewer_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function consultReviewedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'consult_reviewed_by_id');
    }

    /** @return HasMany<ReportReferralSymptomFinding, $this> */
    public function symptomFindings(): HasMany
    {
        return $this->hasMany(ReportReferralSymptomFinding::class);
    }

    protected function casts(): array
    {
        return [
            'referral_date' => 'date:Y-m-d',
            'due_date' => 'date:Y-m-d',
            'response_date' => 'date:Y-m-d',
            'response_recorded_at' => 'immutable_datetime',
            'symptom_verdicts' => 'array',
            'finding_recorded_at' => 'immutable_datetime',
            'office_reviewed_at' => 'immutable_datetime',
            'consult_reviewed_at' => 'immutable_datetime',
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function statuses(): array
    {
        return [
            self::STATUS_PENDING,
            self::STATUS_IN_PROGRESS,
            self::STATUS_COMPLETED,
            self::STATUS_CANCELLED,
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function activeStatuses(): array
    {
        return [self::STATUS_PENDING, self::STATUS_IN_PROGRESS];
    }

    public static function findingSources(): array
    {
        return [
            self::FINDING_SOURCE_IN_SYSTEM,
            self::FINDING_SOURCE_TRANSCRIBED,
        ];
    }

    public function isActive(): bool
    {
        return in_array($this->consult_status, self::activeStatuses(), true);
    }

    /** Keep the concise Phase 1 attribute name available to API/domain callers. */
    public function getStatusAttribute(): ?string
    {
        return $this->consult_status;
    }

    public function setStatusAttribute(?string $status): void
    {
        $this->attributes['consult_status'] = $status;
    }

    public function getSourceAttribute(): ?string
    {
        return $this->finding_source;
    }

    public function setSourceAttribute(?string $source): void
    {
        $this->attributes['finding_source'] = $source;
    }
}
