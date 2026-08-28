<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\MobileFieldValidationAssignmentRequest;
use App\Http\Resources\MobileFieldValidationAssignmentResource;
use App\Models\FieldValidationAssignment;
use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class MobileFieldValidationAssignmentController extends Controller
{
    public function __invoke(
        MobileFieldValidationAssignmentRequest $request,
    ): AnonymousResourceCollection {
        $syncBefore = CarbonImmutable::parse(
            $request->validated('sync_before') ?? now(),
        )->utc();
        if ($request->validated('sync_before') === null) {
            // SQLite/MySQL bindings may truncate the millisecond timestamp
            // written during the assignment mutation. The one-second ceiling
            // keeps an immediately activated assignment in the first feed.
            $syncBefore = $syncBefore->addSecond();
        }
        $query = FieldValidationAssignment::query()
            ->where('assignee_id', $request->user()->getKey())
            ->whereHas('report', function ($query): void {
                $query
                    ->where('case_state', Report::CASE_STATE_OPEN)
                    ->whereIn('field_validation_state', [
                        Report::FIELD_VALIDATION_STATE_ASSIGNED,
                        Report::FIELD_VALIDATION_STATE_IN_PROGRESS,
                        Report::FIELD_VALIDATION_STATE_COMPLETED,
                    ]);
            })
            ->when(
                $request->validated('updated_after'),
                fn ($query, string $updatedAfter) => $query->where(
                    'updated_at',
                    '>',
                    CarbonImmutable::parse($updatedAfter)->utc(),
                ),
            )
            ->where('updated_at', '<=', $syncBefore)
            ->orderBy('updated_at')
            ->orderBy('id')
            ->with([
                'assignee',
                'report.reporter',
            ]);
        $assignments = $query
            ->cursorPaginate((int) ($request->validated('per_page') ?? 100))
            ->withQueryString()
            ->appends(['sync_before' => $syncBefore->toISOString()]);

        return MobileFieldValidationAssignmentResource::collection($assignments)->additional([
            'sync' => [
                'before' => $syncBefore->toISOString(),
            ],
        ]);
    }
}
