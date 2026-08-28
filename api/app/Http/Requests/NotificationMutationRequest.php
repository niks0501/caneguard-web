<?php

namespace App\Http\Requests;

class NotificationMutationRequest extends ApiFormRequest
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
