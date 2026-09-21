<?php

namespace App\Http\Requests;

class ExpertDirectoryRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isOfficeUser() ?? false;
    }

    public function rules(): array
    {
        return [];
    }
}
