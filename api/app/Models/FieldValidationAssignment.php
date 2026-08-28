<?php

namespace App\Models;

use Database\Factories\FieldValidationAssignmentFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable([
    'uuid',
    'report_id',
    'assignee_id',
    'assigned_by_id',
    'target_visit_date',
    'activated_at',
])]
class FieldValidationAssignment extends Model
{
    /** @use HasFactory<FieldValidationAssignmentFactory> */
    use HasFactory, HasUuids;

    protected $dateFormat = 'Y-m-d H:i:s.v';

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    /**
     * @return BelongsTo<Report, $this>
     */
    public function report(): BelongsTo
    {
        return $this->belongsTo(Report::class);
    }

    /**
     * @return HasOne<FieldValidationCompletion, $this>
     */
    public function completion(): HasOne
    {
        return $this->hasOne(FieldValidationCompletion::class, 'assignment_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by_id');
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    protected function casts(): array
    {
        return [
            'target_visit_date' => 'date:Y-m-d',
            'activated_at' => 'immutable_datetime',
        ];
    }
}
