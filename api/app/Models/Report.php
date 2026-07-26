<?php

namespace App\Models;

use Database\Factories\ReportFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'uuid',
    'reference_code',
    'reporter_id',
    'client_uuid',
    'barangay',
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
    'review_notes',
    'reviewer_id',
    'reviewed_at',
    'lock_version',
])]
class Report extends Model
{
    /** @use HasFactory<ReportFactory> */
    use HasFactory, HasUuids;

    protected $dateFormat = 'Y-m-d H:i:s.v';

    public const LABEL_HEALTHY = 'healthy';

    public const LABEL_MOSAIC = 'mosaic';

    public const LABEL_RUST = 'rust';

    public const STATUS_SUBMITTED_UNVERIFIED = 'submitted_unverified';

    public const STATUS_FOR_FIELD_VALIDATION = 'for_field_validation';

    public const STATUS_VERIFIED_BY_STAFF = 'verified_by_staff';

    public const STATUS_UNABLE_TO_VERIFY = 'unable_to_verify';

    public const STATUS_RESOLVED = 'resolved';

    /**
     * @return array<int, string>
     */
    public static function labels(): array
    {
        return [
            self::LABEL_HEALTHY,
            self::LABEL_MOSAIC,
            self::LABEL_RUST,
        ];
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
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'image_size_bytes' => 'integer',
            'source_width' => 'integer',
            'source_height' => 'integer',
            'confidence' => 'decimal:7',
            'preprocess_ms' => 'decimal:3',
            'inference_ms' => 'decimal:3',
            'total_ms' => 'decimal:3',
            'captured_at' => 'immutable_datetime',
            'submitted_at' => 'immutable_datetime',
            'reviewed_at' => 'immutable_datetime',
            'lock_version' => 'integer',
        ];
    }
}
