<?php

namespace App\Http\Requests;

use App\Models\Report;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Validation\Rule;

class PossibleRecentMatchesRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Report::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'predicted_label' => [
                'required',
                'string',
                Rule::in(Report::labels()),
            ],
            'final_latitude' => [
                'sometimes',
                'nullable',
                'numeric',
                'between:-90,90',
            ],
            'final_longitude' => [
                'sometimes',
                'nullable',
                'numeric',
                'between:-180,180',
            ],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $hasLatitude = $this->input('final_latitude') !== null;
            $hasLongitude = $this->input('final_longitude') !== null;

            if ($hasLatitude !== $hasLongitude) {
                $validator->errors()->add(
                    'final_latitude',
                    'Both final latitude and final longitude are required to assess a possible match.',
                );
                $validator->errors()->add(
                    'final_longitude',
                    'Both final latitude and final longitude are required to assess a possible match.',
                );
            }
        });
    }
}
