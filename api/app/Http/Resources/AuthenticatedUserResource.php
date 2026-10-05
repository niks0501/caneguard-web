<?php

namespace App\Http\Resources;

use App\Security\DistrictAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuthenticatedUserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            ...($request->is('api/v1/me') && config('caneguard.accounts_enabled') ? ['accounts_enabled' => true] : []),
            'capabilities' => app(DistrictAccess::class)->capabilities($this->resource),
            'district_id' => app(DistrictAccess::class)->allows($this->resource, app(DistrictAccess::class)->pilotId())
                ? app(DistrictAccess::class)->pilotId() : null,
        ];
    }
}
