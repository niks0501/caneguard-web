<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFieldSurveyRequest;
use App\Models\FieldSurvey;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

class MobileFieldSurveyController extends Controller
{
    public function __invoke(StoreFieldSurveyRequest $request, DistrictAccess $access): JsonResponse
    {
        $data = $request->validated();
        $districtId = $access->pilotId();

        // The unique key and createOrFirst's savepoint also protect simultaneous retries.
        $survey = FieldSurvey::query()->createOrFirst(['client_uuid' => $data['client_uuid']], [
            'inspector_id' => $request->user()->getKey(),
            'district_id' => $districtId,
            'polygon' => $data['polygon'],
            'area_sqm' => $data['area_sqm'],
            'captured_at' => CarbonImmutable::parse($data['captured_at'])->utc(),
        ]);

        // A UUID cannot be used to retrieve another inspector's (or district's) receipt.
        if ($survey->inspector_id !== $request->user()->getKey() || $survey->district_id !== $districtId) {
            throw ValidationException::withMessages([
                'client_uuid' => ['The client uuid is unavailable. Use a new survey UUID.'],
            ]);
        }

        return response()->json(['id' => $survey->getKey(), 'status' => 'kept'], 201);
    }
}
