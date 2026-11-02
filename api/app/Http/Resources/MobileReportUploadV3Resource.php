<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;

class MobileReportUploadV3Resource extends MobileReportUploadResource
{
    public function toArray(Request $request): array
    {
        $payload = parent::toArray($request);
        $payload['identity']['field_survey_client_uuid'] = $this->field_survey_client_uuid;

        return $payload;
    }
}
