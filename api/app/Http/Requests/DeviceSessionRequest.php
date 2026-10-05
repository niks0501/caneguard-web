<?php

namespace App\Http\Requests;

use App\Security\DistrictAccess;

class DeviceSessionRequest extends MobileSessionRequest
{
    public function authorize(): bool
    {
        if ($this->routeIs('api.v1.auth.devices*')) {
            return $this->bearerToken() === null && app(DistrictAccess::class)->office($this->user());
        }

        return parent::authorize();
    }
}
