<?php

namespace App\Http\Requests;

use App\Rules\AffectedAreaPolygons;
use App\Rules\MeasurementProvenance;
use App\Rules\SurveyPolygon;
use App\Security\DistrictAccess;
use Closure;
use Illuminate\Validation\Rule;

class StoreFieldSurveyRequest extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('client_uuid'))) {
            $this->merge(['client_uuid' => strtolower($this->input('client_uuid'))]);
        }
    }

    public function authorize(): bool
    {
        return app(DistrictAccess::class)->inspector($this->user());
    }

    public function rules(): array
    {
        return [
            'client_uuid' => ['required', 'string', 'uuid'],
            'polygon' => ['required', new SurveyPolygon],
            'area_sqm' => ['required', function (string $attribute, mixed $value, Closure $fail): void {
                if ((! is_int($value) && ! is_float($value)) || ! is_finite((float) $value) || $value <= 0) {
                    $fail('The area sqm must be a finite number greater than zero.');
                }
            }],
            // Optional affected-area evidence: old plot-only payloads stay valid.
            'affected_area_polygons' => ['nullable', new AffectedAreaPolygons],
            'affected_area_polygons.*' => ['required', new SurveyPolygon],
            'affected_area_sqm' => ['nullable', function (string $attribute, mixed $value, Closure $fail): void {
                if ((! is_int($value) && ! is_float($value)) || ! is_finite((float) $value) || $value < 0) {
                    $fail('The affected area sqm must be a finite number greater than or equal to zero.');
                }
            }],
            'measurement_provenance' => ['nullable', new MeasurementProvenance],
            'captured_at' => ['required', 'string', 'max:40', 'date',
                'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/D',
                'after_or_equal:1000-01-01T00:00:00Z', 'before_or_equal:9999-12-31T23:59:59Z'],
            'district_code' => ['required', 'string', 'max:80',
                Rule::in([trim((string) config('caneguard.pilot_district_code'))])],
        ];
    }

    public function messages(): array
    {
        return ['district_code.in' => 'The district code must match the configured pilot district.'];
    }
}
