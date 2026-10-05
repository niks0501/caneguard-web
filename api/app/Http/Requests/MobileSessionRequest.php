<?php

namespace App\Http\Requests;

use App\Models\PersonalAccessToken;

class MobileSessionRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }

        return $user->isMobileUser()
            && ($this->bearerToken() === null || $user->currentAccessToken() instanceof PersonalAccessToken);
    }

    public function rules(): array
    {
        return [];
    }
}
