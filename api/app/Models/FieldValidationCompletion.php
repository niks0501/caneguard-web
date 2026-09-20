<?php

namespace App\Models;

use Database\Factories\FieldValidationCompletionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'uuid',
    'assignment_id',
    'client_uuid',
    'field_observation',
    'field_finding',
    'action_taken',
    'follow_up_outcome',
    'visited_at',
    'gps_outcome',
    'gps_attempted_at',
    'gps_latitude',
    'gps_longitude',
    'gps_accuracy',
    'fresh_photo_path',
    'fresh_photo_mime_type',
    'fresh_photo_size_bytes',
])]
class FieldValidationCompletion extends Model
{
    /** @use HasFactory<FieldValidationCompletionFactory> */
    use HasFactory, HasUuids;

    protected $dateFormat = 'Y-m-d H:i:s.v';

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /**
     * @return BelongsTo<FieldValidationAssignment, $this>
     */
    public function assignment(): BelongsTo
    {
        return $this->belongsTo(FieldValidationAssignment::class, 'assignment_id');
    }

    protected function casts(): array
    {
        return [
            'client_uuid' => 'string',
            'follow_up_outcome' => 'string',
            'visited_at' => 'immutable_datetime',
            'gps_attempted_at' => 'immutable_datetime',
            'gps_latitude' => 'decimal:7',
            'gps_longitude' => 'decimal:7',
            'gps_accuracy' => 'decimal:2',
            'fresh_photo_size_bytes' => 'integer',
        ];
    }
}
