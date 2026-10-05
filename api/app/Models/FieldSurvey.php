<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

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
}
