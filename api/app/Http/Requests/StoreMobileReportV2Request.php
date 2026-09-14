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
