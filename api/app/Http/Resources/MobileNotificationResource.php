<?php

namespace App\Http\Resources;

use App\Contracts\MobileNotificationContract;
use Illuminate\Http\Request;

class MobileNotificationResource extends NotificationResource
{
    public function toArray(Request $request): array
    {
        MobileNotificationContract::definition();

        return parent::toArray($request);
    }
}
