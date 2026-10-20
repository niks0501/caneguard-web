<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

#[Fillable(['client_uuid', 'inspector_id', 'district_id', 'polygon', 'area_sqm', 'captured_at'])]
class FieldSurvey extends Model
{
    protected $dateFormat = 'Y-m-d H:i:s.u';

    protected function casts(): array
    {
        return [
            'polygon' => 'array',
            'area_sqm' => 'double',
            'captured_at' => 'immutable_datetime',
        ];
    }

    public function inspector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inspector_id');
    }

    /**
     * @return BelongsToMany<Report, $this>
     */
    public function affectedReports(): BelongsToMany
    {
        return $this->belongsToMany(Report::class, 'report_affected_field_surveys')
            ->withPivot('loss_rate_percent')
            ->withTimestamps();
    }
}
