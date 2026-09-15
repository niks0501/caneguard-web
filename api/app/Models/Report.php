<?php

namespace App\Models;

use App\Contracts\MobileReportUploadContract;
use App\Contracts\MobileReportUploadV2Contract;
use App\Contracts\ReportLifecycleContract;
use Database\Factories\ReportFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable([
    'uuid',
    'reference_code',
    'reporter_id',
    'client_uuid',
    'scan_record_client_uuid',
    'barangay',
    'farmer_or_farm_owner_name',
    'province',
    'municipality',
    'final_latitude',
    'final_longitude',
    'location_source',
    'location_unavailable_reason',
    'gps_accuracy',
    'observed_at',
    'sugarcane_variety',
    'crop_age',
    'cane_class',
    'affected_area_hectares',
    'affected_area_measurement',
    'affected_portion_percent',
    'affected_portion_measurement',
    'field_notes',
    'mismatch_reported',
    'reporter_suspected_condition',
    'reporter_observation_text',
    'image_path',
    'image_mime_type',
    'image_size_bytes',
    'image_source_type',
    'source_width',
    'source_height',
    'predicted_label',
    'confidence',
    'checklist_consistency',
    'reported_severity',
    'model_version',
    'preprocess_ms',
    'inference_ms',
    'total_ms',
    'captured_at',
    'submitted_at',
    'review_status',
    'case_state',
    'verification_outcome',
    'field_validation_state',
    'referral_state',
    'action_taken',
    'review_notes',
    'authority_classified_condition',
    'reviewer_id',
    'reviewed_at',
    'lock_version',
    'canonical_report_id',
])]
class Report extends Model
{
    /** @use HasFactory<ReportFactory> */
    use HasFactory, HasUuids;

    protected $dateFormat = 'Y-m-d H:i:s.v';

    public const LABEL_HEALTHY = 'healthy';

    public const LABEL_MOSAIC = 'mosaic';

    public const LABEL_RUST = 'rust';

    public const LABEL_SMUT = 'smut';

    /** Stable free-text value used when Mobile reports RSSI as field evidence. */
    public const REPORTER_CONCERN_RSSI = 'RSSI';

    /** D-01: explicit provenance for a reported affected-area value. */
    public const MEASUREMENT_MEASURED = 'measured';

    public const MEASUREMENT_NOT_MEASURED = 'not_measured';

    /** D-02: a location that was deliberately not captured before submission. */
    public const LOCATION_SOURCE_UNAVAILABLE = 'unavailable';

    public const LOCATION_SOURCE_GPS = 'gps';

    public const LOCATION_SOURCE_MANUAL_MAP = 'manual_map';

    public const LOCATION_UNAVAILABLE_REASON_PERMISSION_DENIED = 'permission_denied';

    public const LOCATION_UNAVAILABLE_REASON_SERVICES_UNAVAILABLE = 'services_unavailable';

    public const LOCATION_UNAVAILABLE_REASON_LOW_ACCURACY = 'low_accuracy';

    public const LOCATION_UNAVAILABLE_REASON_OFFLINE_NO_MAP = 'offline_no_map';

    public const LOCATION_UNAVAILABLE_REASON_OTHER = 'other';

    public const AUTHORITY_CONDITION_HEALTHY = 'healthy';

    public const AUTHORITY_CONDITION_SMUT = 'smut';

    public const AUTHORITY_CONDITION_MOSAIC = 'mosaic';

    public const AUTHORITY_CONDITION_RUST = 'rust';

    public const AUTHORITY_CONDITION_RSSI = 'rssi';

    public const AUTHORITY_CONDITION_DOWNY_MILDEW = 'downy_mildew';

    public const AUTHORITY_CONDITION_MIXED_OR_MULTIPLE = 'mixed_or_multiple';

    public const AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY = 'unable_to_classify';

    public const STATUS_SUBMITTED_UNVERIFIED = 'submitted_unverified';

    public const STATUS_FOR_FIELD_VALIDATION = 'for_field_validation';

    public const STATUS_VERIFIED_BY_STAFF = 'verified_by_staff';

    public const STATUS_UNABLE_TO_VERIFY = 'unable_to_verify';

    public const STATUS_RESOLVED = 'resolved';

    public const QUEUE_NEEDS_REVIEW = 'needs_review';

    public const QUEUE_NEEDS_VISIT = 'needs_visit';

    public const QUEUE_FOLLOW_UP_DUE = 'follow_up_due';

    public const CASE_STATE_OPEN = 'open';

    public const CASE_STATE_CLOSED = 'closed';

    public const VERIFICATION_OUTCOME_NOT_DETERMINED = 'not_determined';

    public const VERIFICATION_OUTCOME_VERIFIED = 'verified';

    public const VERIFICATION_OUTCOME_UNABLE_TO_VERIFY = 'unable_to_verify';

    public const FIELD_VALIDATION_STATE_UNASSIGNED = 'unassigned';

    public const FIELD_VALIDATION_STATE_ASSIGNED = 'assigned';

    public const FIELD_VALIDATION_STATE_IN_PROGRESS = 'in_progress';

    public const FIELD_VALIDATION_STATE_COMPLETED = 'completed';

    public const REFERRAL_STATE_NOT_REFERRED = 'not_referred';

    public const REFERRAL_STATE_REFERRED = 'referred';

    public const REFERRAL_STATE_EXPERT_RESPONSE_RECEIVED = 'expert_response_received';

    public const ACTION_ADVISORY_PROVIDED = 'advisory_provided';

    public const ACTION_TECHNICAL_ASSISTANCE_PROVIDED = 'technical_assistance_provided';

    public const ACTION_REFERRED_FOR_EXPERT_VALIDATION = 'referred_for_expert_validation';

    public const ACTION_NO_FURTHER_ACTION_REQUIRED = 'no_further_action_required';

    public const AUDIT_FIELD_CANONICAL_REPORT = 'canonical_report_id';

    /**
     * Resolve the recorded measurement provenance for affected area.
     *
     * Rows written before D-01 have no explicit provenance, so a stored number
     * reads as measured and a missing number reads as not measured.
     */
    public function affectedAreaMeasurement(): string
    {
        return $this->affected_area_measurement
            ?? ($this->affected_area_hectares === null
                ? self::MEASUREMENT_NOT_MEASURED
                : self::MEASUREMENT_MEASURED);
    }

    /** @see affectedAreaMeasurement() */
    public function affectedPortionMeasurement(): string
    {
        return $this->affected_portion_measurement
            ?? ($this->affected_portion_percent === null
                ? self::MEASUREMENT_NOT_MEASURED
                : self::MEASUREMENT_MEASURED);
    }

    /** True when the reporter submitted without an exact coordinate on purpose. */
    public function hasLocationUnavailable(): bool
    {
        return $this->location_source === self::LOCATION_SOURCE_UNAVAILABLE;
    }

    /**
     * Evidence submitted by Mobile is immutable after the report is created.
     * Operational metadata uses the explicit audited correction path instead.
     *
     * @return array<int, string>
     */
    public static function immutableEvidenceAttributes(): array
    {
        return [
            'uuid',
            'reference_code',
            'reporter_id',
            'client_uuid',
            'scan_record_client_uuid',
            'image_path',
            'image_mime_type',
            'image_size_bytes',
            'image_source_type',
            'source_width',
            'source_height',
            'predicted_label',
            'confidence',
            'checklist_consistency',
            'reported_severity',
            'model_version',
            'preprocess_ms',
            'inference_ms',
            'total_ms',
            'captured_at',
            'observed_at',
            'submitted_at',
            'mismatch_reported',
            'reporter_suspected_condition',
            'field_notes',
            'reporter_observation_text',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (self $report): void {
            $reviewStatus = $report->getAttribute('review_status')
                ?? self::STATUS_SUBMITTED_UNVERIFIED;

            foreach (self::lifecycleForReviewStatus((string) $reviewStatus) as $attribute => $value) {
                if ($report->getAttribute($attribute) === null) {
                    $report->setAttribute($attribute, $value);
                }
            }
        });

        static::updating(function (self $report): void {
            $changedEvidence = array_values(array_intersect(
                array_keys($report->getDirty()),
                self::immutableEvidenceAttributes(),
            ));

            if ($changedEvidence !== []) {
                throw new \LogicException(
                    'Synchronized report evidence is immutable: '
                    .implode(', ', $changedEvidence),
                );
            }
        });
    }

    /**
     * @return array<int, string>
     */
    public static function labels(): array
    {
        return MobileReportUploadContract::enumValues('predicted_label');
    }

    /**
     * Labels accepted by the breaking Model V1 mobile report contract.
     * The legacy accessor intentionally remains V1-compatible for unrelated
     * API consumers.
     *
     * @return array<int, string>
     */
    public static function v2Labels(): array
    {
        return MobileReportUploadV2Contract::enumValues('predicted_label');
    }

    /**
     * Values that may be selected for a new Staff-Classified Condition review.
     *
     * @return array<int, string>
     */
    public static function activeAuthorityClassifiedConditions(): array
    {
        return [
            self::AUTHORITY_CONDITION_HEALTHY,
            self::AUTHORITY_CONDITION_SMUT,
            self::AUTHORITY_CONDITION_MOSAIC,
            self::AUTHORITY_CONDITION_RUST,
            self::AUTHORITY_CONDITION_RSSI,
            self::AUTHORITY_CONDITION_MIXED_OR_MULTIPLE,
            self::AUTHORITY_CONDITION_UNABLE_TO_CLASSIFY,
        ];
    }

    /**
     * Values retained so historical reports remain readable during the
     * expand-first compatibility transition. They are not new-review options.
     *
     * @return array<int, string>
     */
    public static function legacyAuthorityClassifiedConditions(): array
    {
        return [self::AUTHORITY_CONDITION_DOWNY_MILDEW];
    }

    /**
     * All values accepted at the API boundary, including legacy values that
     * must continue to parse and persist when already present on a report.
     *
     * @return array<int, string>
     */
    public static function authorityClassifiedConditions(): array
    {
        return [
            ...self::activeAuthorityClassifiedConditions(),
            ...self::legacyAuthorityClassifiedConditions(),
        ];
    }

    /**
     * Legacy Downy mildew may only be carried forward from a historical
     * record; it is not a valid new Staff-Classified Condition selection.
     */
    public function canUpdateAuthorityClassifiedCondition(?string $condition): bool
    {
        return $condition !== self::AUTHORITY_CONDITION_DOWNY_MILDEW
            || $this->authority_classified_condition === self::AUTHORITY_CONDITION_DOWNY_MILDEW;
    }

    /**
     * @return array<int, string>
     */
    public static function reviewStatuses(): array
    {
        return [
            self::STATUS_SUBMITTED_UNVERIFIED,
            self::STATUS_FOR_FIELD_VALIDATION,
            self::STATUS_VERIFIED_BY_STAFF,
            self::STATUS_UNABLE_TO_VERIFY,
            self::STATUS_RESOLVED,
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function operationalQueues(): array
    {
        return [
            self::QUEUE_NEEDS_REVIEW,
            self::QUEUE_NEEDS_VISIT,
            self::QUEUE_FOLLOW_UP_DUE,
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function caseStates(): array
    {
        return ReportLifecycleContract::values('case_state');
    }

    /**
     * @return array<int, string>
     */
    public static function verificationOutcomes(): array
    {
        return ReportLifecycleContract::values('verification_outcome');
    }

    /**
     * @return array<int, string>
     */
    public static function fieldValidationStates(): array
    {
        return ReportLifecycleContract::values('field_validation_state');
    }

    /**
     * @return array<int, string>
     */
    public static function referralStates(): array
    {
        return ReportLifecycleContract::values('referral_state');
    }

    /**
     * @return array<int, string>
     */
    public static function actionTakenValues(): array
    {
        return [
            self::ACTION_ADVISORY_PROVIDED,
            self::ACTION_TECHNICAL_ASSISTANCE_PROVIDED,
            self::ACTION_REFERRED_FOR_EXPERT_VALIDATION,
            self::ACTION_NO_FURTHER_ACTION_REQUIRED,
        ];
    }

    /**
     * Translate independent lifecycle dimensions into a safe legacy status.
     *
     * Open cases never appear completed to an older client. Field-validation
     * progress remains visible when possible, while referral and action data
     * fall back to the open submitted status because legacy clients cannot
     * represent those dimensions.
     */
    public static function legacyReviewStatusForLifecycle(array $lifecycle): string
    {
        if (($lifecycle['case_state'] ?? null) === self::CASE_STATE_CLOSED) {
            return match ($lifecycle['verification_outcome'] ?? null) {
                self::VERIFICATION_OUTCOME_VERIFIED => self::STATUS_VERIFIED_BY_STAFF,
                self::VERIFICATION_OUTCOME_UNABLE_TO_VERIFY => self::STATUS_UNABLE_TO_VERIFY,
                default => self::STATUS_RESOLVED,
            };
        }

        return ($lifecycle['field_validation_state'] ?? self::FIELD_VALIDATION_STATE_UNASSIGNED)
            === self::FIELD_VALIDATION_STATE_UNASSIGNED
            ? self::STATUS_SUBMITTED_UNVERIFIED
            : self::STATUS_FOR_FIELD_VALIDATION;
    }

    /**
     * Translate the legacy flat status into independent lifecycle dimensions.
     *
     * This mapping is intentionally conservative for `resolved`: resolution
     * records closure, but does not invent a verification outcome that the old
     * status did not store. Unknown legacy values are treated as closed so a
     * malformed historical row cannot create a new work item.
     *
     * @return array{case_state: string, verification_outcome: string, field_validation_state: string, referral_state: string}
     */
    public static function lifecycleForReviewStatus(string $reviewStatus): array
    {
        return ReportLifecycleContract::legacyProjection($reviewStatus);
    }

    /**
     * Return lifecycle values with a compatibility fallback for records read
     * while an older schema or partially backfilled data is still present.
     *
     * @return array{case_state: string, verification_outcome: string, field_validation_state: string, referral_state: string}
     */
    public function lifecycleSnapshot(): array
    {
        $defaults = self::lifecycleForReviewStatus(
            (string) ($this->review_status ?? self::STATUS_SUBMITTED_UNVERIFIED),
        );

        return [
            'case_state' => $this->case_state ?? $defaults['case_state'],
            'verification_outcome' => $this->verification_outcome
                ?? $defaults['verification_outcome'],
            'field_validation_state' => $this->field_validation_state
                ?? $defaults['field_validation_state'],
            'referral_state' => $this->referral_state ?? $defaults['referral_state'],
        ];
    }

    /**
     * @return array<int, string>
     */
    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reporter_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    /**
     * @return BelongsTo<Report, $this>
     */
    public function canonicalReport(): BelongsTo
    {
        return $this->belongsTo(self::class, 'canonical_report_id');
    }

    /**
     * @return HasMany<Report, $this>
     */
    public function duplicateReports(): HasMany
    {
        return $this->hasMany(self::class, 'canonical_report_id');
    }

    /**
     * @return HasOne<FieldValidationAssignment, $this>
     */
    public function fieldValidationAssignment(): HasOne
    {
        return $this->hasOne(FieldValidationAssignment::class);
    }

    /**
     * @return HasOne<ReportReferral, $this>
     */
    public function referral(): HasOne
    {
        return $this->hasOne(ReportReferral::class);
    }

    /**
     * @return HasMany<ReportClassScore, $this>
     */
    public function classScores(): HasMany
    {
        return $this->hasMany(ReportClassScore::class);
    }

    /**
     * @return HasMany<ReportSymptom, $this>
     */
    public function symptoms(): HasMany
    {
        return $this->hasMany(ReportSymptom::class);
    }

    /**
     * @return HasMany<ReportQualityWarning, $this>
     */
    public function qualityWarnings(): HasMany
    {
        return $this->hasMany(ReportQualityWarning::class);
    }

    /**
     * @return HasMany<ReportAudit, $this>
     */
    public function audits(): HasMany
    {
        return $this->hasMany(ReportAudit::class)
            ->orderByDesc('created_at')
            ->orderByDesc('id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'image_size_bytes' => 'integer',
            'source_width' => 'integer',
            'source_height' => 'integer',
            'farmer_or_farm_owner_name' => 'string',
            'province' => 'string',
            'municipality' => 'string',
            'final_latitude' => 'decimal:7',
            'final_longitude' => 'decimal:7',
            'location_source' => 'string',
            'location_unavailable_reason' => 'string',
            'gps_accuracy' => 'decimal:2',
            'sugarcane_variety' => 'string',
            'crop_age' => 'string',
            'cane_class' => 'string',
            'affected_area_hectares' => 'decimal:2',
            'affected_area_measurement' => 'string',
            'affected_portion_percent' => 'decimal:2',
            'affected_portion_measurement' => 'string',
            'field_notes' => 'string',
            'mismatch_reported' => 'boolean',
            'reporter_suspected_condition' => 'string',
            'reporter_observation_text' => 'string',
            'authority_classified_condition' => 'string',
            'confidence' => 'decimal:7',
            'preprocess_ms' => 'decimal:3',
            'inference_ms' => 'decimal:3',
            'total_ms' => 'decimal:3',
            'captured_at' => 'immutable_datetime',
            'observed_at' => 'immutable_datetime',
            'submitted_at' => 'immutable_datetime',
            'reviewed_at' => 'immutable_datetime',
            'lock_version' => 'integer',
        ];
    }
}
