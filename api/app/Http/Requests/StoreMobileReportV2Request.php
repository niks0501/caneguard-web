<?php

namespace App\Http\Requests;

use App\Contracts\MobileReportUploadV2Contract;
use App\Models\Report;

class StoreMobileReportV2Request extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        $normalized = MobileReportUploadV2Contract::normalization($this);

        if ($normalized !== []) {
            $this->merge($normalized);
        }

        $this->merge($this->measurementProvenance());
    }

    /**
     * D-01: infer explicit measurement provenance so the stored report records
     * whether a value was actually measured instead of leaving null ambiguous.
     * An explicitly supplied provenance always wins.
     *
     * @return array<string, string>
     */
    private function measurementProvenance(): array
    {
        $provenance = [];

        foreach ([
            'affected_area_measurement' => 'affected_area_hectares',
            'affected_portion_measurement' => 'affected_portion_percent',
        ] as $measurementField => $valueField) {
            if ($this->has($measurementField)) {
                continue;
            }

            $raw = $this->input($valueField);
            $hasValue = $raw !== null && $raw !== '';

            $provenance[$measurementField] = $hasValue
                ? Report::MEASUREMENT_MEASURED
                : Report::MEASUREMENT_NOT_MEASURED;
        }

        return $provenance;
    }

    public function authorize(): bool
    {
        return $this->user()?->can('create', Report::class) ?? false;
    }

    public function rules(): array
    {
        return MobileReportUploadV2Contract::rules($this);
    }
}
