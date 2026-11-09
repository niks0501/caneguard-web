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

        $hasMobileCredential = $this->bearerToken() === null
            || $user->currentAccessToken() instanceof PersonalAccessToken;

        return $hasMobileCredential
            && ($this->routeIs('api.v1.mobile.auth.me') || $user->isMobileUser());
    }

    public function rules(): array
    {
        return [];
    }
}
