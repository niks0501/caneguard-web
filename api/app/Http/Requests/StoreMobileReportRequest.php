<?php

namespace App\Http\Requests;

use App\Contracts\MobileReportUploadContract;
use App\Models\Report;

class StoreMobileReportRequest extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        $normalized = MobileReportUploadContract::normalization($this);

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
        return MobileReportUploadContract::rules($this);
    }
}
