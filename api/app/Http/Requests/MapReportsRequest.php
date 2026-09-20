<?php

namespace App\Http\Requests;

use App\Models\Report;

class MapReportsRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('viewAny', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            ...ReportFilterRules::rules(),
            'limit' => [
                'sometimes',
                'integer',
                'min:1',
                'max:'.(int) config('caneguard.map.max_limit', 1000),
            ],
        ];
    }
}
