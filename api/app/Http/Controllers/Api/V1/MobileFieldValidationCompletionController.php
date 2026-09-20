<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\CompleteFieldValidationAssignment;
use App\Actions\Reports\FieldValidationCompletionConflict;
use App\Http\Controllers\Controller;
use App\Http\Requests\MobileFieldValidationCompletionRequest;
use App\Http\Resources\FieldValidationCompletionResource;
use App\Models\FieldValidationAssignment;
use Illuminate\Http\JsonResponse;

class MobileFieldValidationCompletionController extends Controller
{
    public function __invoke(
        MobileFieldValidationCompletionRequest $request,
        FieldValidationAssignment $assignment,
        CompleteFieldValidationAssignment $complete,
    ): JsonResponse {
        try {
            $result = $complete->handle(
                $request->user(),
                $assignment,
                $request->validated(),
                $request->file('fresh_photo'),
            );
        } catch (FieldValidationCompletionConflict $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'code' => 'CONFLICT',
            ], 409);
        }

        $lifecycle = $result['report']->lifecycleSnapshot();

        return response()->json([
            'data' => [
                'completion' => (new FieldValidationCompletionResource($result['completion']))->resolve($request),
                'assignment' => [
                    'uuid' => $result['assignment']->uuid,
                    'field_validation_state' => $lifecycle['field_validation_state'],
                    'updated_at' => $result['assignment']->updated_at->utc()->toISOString(),
                ],
                'case' => [
                    'uuid' => $result['report']->uuid,
                    'case_state' => $lifecycle['case_state'],
                    'verification_outcome' => $lifecycle['verification_outcome'],
                ],
            ],
        ], $result['created'] ? 201 : 200);
    }
}
