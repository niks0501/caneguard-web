<?php

namespace App\Http\Requests;

use App\Models\PersonalAccessToken;
use App\Models\User;

class MobileSessionRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        if (! $user) {
            return false;
        }

        if ($this->bearerToken() !== null) {
            return ($user->isFieldReporter() || $user->role === User::ROLE_FARMER)
                && $user->currentAccessToken() instanceof PersonalAccessToken;
        }

        return $user->isCertifiedStaff() || $user->role === User::ROLE_FARMER;
    }

    public function rules(): array
    {
        return [];
    }
}
