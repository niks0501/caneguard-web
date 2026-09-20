<?php

namespace App\Http\Requests;

class AuthenticatedUserRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isWebUser() ?? false;
    }

    public function rules(): array
    {
        return [];
    }
}
