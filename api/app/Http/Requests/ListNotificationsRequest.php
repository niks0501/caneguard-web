<?php

namespace App\Http\Requests;

class ListNotificationsRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->isWebUser() ?? false;
    }

    public function rules(): array
    {
        return [
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ];
    }
}
