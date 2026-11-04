<?php

namespace App\Http\Resources;

use App\Security\DistrictAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuthenticatedUserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $access = app(DistrictAccess::class);
        $inDistrict = ! $request->is('api/v1/me') && $access->allows($this->resource, $access->pilotId());

        return [
            'uuid' => $this->uuid,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
            ...($request->is('api/v1/me') ? ['is_active' => $this->is_active] : [
                'capabilities' => $access->capabilities($this->resource),
                'district_id' => $inDistrict ? $access->pilotId() : null,
                'district_code' => $inDistrict ? trim((string) config('caneguard.pilot_district_code')) : null,
            ]),
        ];
    }
}
