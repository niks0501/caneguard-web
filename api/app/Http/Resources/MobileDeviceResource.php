<?php

namespace App\Http\Resources;

use App\Actions\Auth\IssueMobileToken;
use App\Models\PersonalAccessToken;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;

/** @mixin PersonalAccessToken */
class MobileDeviceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $name = (string) $this->name;
        $prefix = IssueMobileToken::TOKEN_NAME_PREFIX;
        $currentToken = $request->user()?->currentAccessToken();

        return [
            'id' => $this->getKey(),
            'device_id' => $this->device_id,
            'device_name' => Str::startsWith($name, $prefix)
                ? Str::after($name, $prefix)
                : $name,
            'created_at' => $this->created_at?->utc()->toISOString(),
            'last_used_at' => $this->last_used_at?->utc()->toISOString(),
            'expires_at' => $this->expires_at?->utc()->toISOString(),
            'is_current' => (string) $currentToken?->getKey() === (string) $this->getKey(),
        ];
    }
}
