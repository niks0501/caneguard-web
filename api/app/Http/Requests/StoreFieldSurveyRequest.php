<?php

namespace App\Http\Requests;

use App\Models\FieldSurvey;
use App\Rules\AffectedAreaPolygons;
use App\Rules\AffectedAreaWaypoints;
use App\Rules\MeasurementProvenance;
use App\Rules\SurveyPolygon;
use App\Security\DistrictAccess;
use Closure;
use Illuminate\Validation\Rule;

class StoreFieldSurveyRequest extends ApiFormRequest
{
    /** Geodesic rounding allowance: the affected area may exceed the plot by up to 1%. */
    private const AFFECTED_AREA_TOLERANCE = 1.01;

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('client_uuid'))) {
            $this->merge(['client_uuid' => strtolower($this->input('client_uuid'))]);
        }
        if (is_string($this->input('label'))) {
            // A blank name is no name.
            $label = trim($this->input('label'));
            $this->merge(['label' => $label === '' ? null : $label]);
        }

        $this->merge($this->affectedAreaMeasurementDefaults());
    }

    /**
     * Older phones omit affected_area_measurement. They also forced an affected
     * area of 0 onto every survey with no affected polygons, so no build before
     * this field could have confirmed a zero: that shape is stored as not
     * measured with a null figure. Zero is never inferred as measured from empty
     * polygons; only an explicit `measured` keeps it. An explicit value, valid or
     * not, is left for the rules to judge.
     *
     * @return array<string, mixed>
     */
    private function affectedAreaMeasurementDefaults(): array
    {
        if ($this->input('affected_area_measurement') !== null) {
            return [];
        }

        $sqm = $this->input('affected_area_sqm');
        if ($sqm === null) {
            return ['affected_area_measurement' => FieldSurvey::MEASUREMENT_NOT_MEASURED];
        }

        $polygons = $this->input('affected_area_polygons');
        $isLegacyForcedZero = (is_int($sqm) || is_float($sqm)) && (float) $sqm === 0.0
            && ($polygons === null || $polygons === []);

        return $isLegacyForcedZero
            ? ['affected_area_measurement' => FieldSurvey::MEASUREMENT_NOT_MEASURED, 'affected_area_sqm' => null]
            : ['affected_area_measurement' => FieldSurvey::MEASUREMENT_MEASURED];
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
            // Optional: a name the inspector typed, and the earlier map whose outline
            // this one reused. Old payloads without them stay valid.
            'label' => ['nullable', 'string', 'max:60'],
            'outline_from_survey_id' => [
                'nullable',
                'integer',
                'min:1',
                Rule::exists('field_surveys', 'id')
                    ->where(fn ($query) => $query->where('district_id', app(DistrictAccess::class)->pilotId() ?? 0)),
            ],
            // Optional affected-area evidence: old plot-only payloads stay valid.
            'affected_area_polygons' => ['nullable', new AffectedAreaPolygons],
            'affected_area_polygons.*' => ['required', new SurveyPolygon],
            'affected_area_sqm' => ['nullable', function (string $attribute, mixed $value, Closure $fail): void {
                if ((! is_int($value) && ! is_float($value)) || ! is_finite((float) $value)
                    || $value < 0 || $value >= 1.0E16) {
                    $fail('The affected area sqm must be a finite number greater than or equal to zero and less than 10000000000000000.');

                    return;
                }

                $plot = $this->input('area_sqm');
                if ((is_int($plot) || is_float($plot)) && is_finite((float) $plot) && $plot > 0
                    && (float) $value > (float) $plot * self::AFFECTED_AREA_TOLERANCE) {
                    $fail('The affected area sqm must not exceed the plot area sqm.');
                }
            }],
            // Whether the affected area was measured. Omitted by older phones; see
            // affectedAreaMeasurementDefaults(). not_measured pairs with a null
            // figure, measured with a figure of 0 or more and no more than the plot.
            'affected_area_measurement' => ['required', 'string',
                Rule::in([FieldSurvey::MEASUREMENT_MEASURED, FieldSurvey::MEASUREMENT_NOT_MEASURED]),
                function (string $attribute, mixed $value, Closure $fail): void {
                    $sqm = $this->input('affected_area_sqm');

                    if ($value === FieldSurvey::MEASUREMENT_NOT_MEASURED && $sqm !== null) {
                        $fail('The affected area sqm must be null when the affected area is not measured.');
                    }

                    if ($value === FieldSurvey::MEASUREMENT_MEASURED && $sqm === null) {
                        $fail('The affected area sqm is required when the affected area is measured.');
                    }
                }],
            'measurement_provenance' => ['nullable', new MeasurementProvenance],
            'affected_area_waypoints' => ['nullable', new AffectedAreaWaypoints],
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
