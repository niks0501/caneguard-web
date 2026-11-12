<?php

namespace App\Http\Middleware;

use App\Models\FieldSurvey;
use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use App\Models\Report;
use App\Security\DistrictAccess;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Answers a resend of an already accepted intake record from its client key,
 * before capability, validation and domain checks run. A lost reply followed
 * by revocation, reassignment or a rule change must not turn work the office
 * already holds into a refusal. The receipt carries ids only, never review data.
 */
final class ReplayAcceptedIntake
{
    public const REPORT = 'report';

    public const SURVEY = 'survey';

    public const COMPLETION = 'completion';

    public function handle(Request $request, Closure $next, string $kind): Response
    {
        $user = $request->user();
        $key = $request->input('client_uuid');

        // A deactivated account is never answered here; the existing refusal stands.
        if ($user === null || ! is_string($key) || ! Str::isUuid($key) || ! $user->fresh()?->is_active) {
            return $next($request);
        }

        $key = strtolower($key);

        return match ($kind) {
            self::REPORT => $this->report($request, $next, $user->getKey(), $key),
            self::SURVEY => $this->survey($request, $next, $user->getKey(), $key),
            self::COMPLETION => $this->completion($request, $next, $user->getKey(), $key),
            default => throw new InvalidArgumentException("Unknown intake kind [{$kind}]."),
        };
    }

    private function report(Request $request, Closure $next, int|string $userId, string $key): Response
    {
        // Report keys are scoped to the reporter, so another user's key is simply a new record.
        $report = Report::query()
            ->where('reporter_id', $userId)
            ->where('client_uuid', $key)
            ->first();

        if (! $report) {
            return $next($request);
        }

        // While the reporter is still authorised and can see the case, the
        // existing resend path keeps returning the full report the phone
        // already parses. Only a reporter who lost access gets the ids.
        $access = app(DistrictAccess::class);
        $user = $request->user();

        if ($access->hasMobileCapability($user, 'report:submit')
            && Report::query()->visibleTo($user)->whereKey($report->getKey())->exists()) {
            return $next($request);
        }

        $identity = [
            'uuid' => $report->uuid,
            'reference_code' => $report->reference_code,
            'client_uuid' => $report->client_uuid,
        ];

        if ($request->is('api/v3/*')) {
            $identity['field_survey_client_uuid'] = $report->field_survey_client_uuid;
        }

        return $this->receipt(['data' => ['identity' => $identity]], $report->created_at);
    }

    private function survey(Request $request, Closure $next, int|string $userId, string $key): Response
    {
        $survey = FieldSurvey::query()->where('client_uuid', $key)->first();

        if (! $survey) {
            return $next($request);
        }

        // A key cannot be used to retrieve another inspector's receipt.
        if ((int) $survey->inspector_id !== (int) $userId) {
            throw ValidationException::withMessages([
                'client_uuid' => ['The client uuid is unavailable. Use a new survey UUID.'],
            ]);
        }

        return $this->receipt(['id' => (string) $survey->getKey(), 'status' => 'kept'], $survey->created_at);
    }

    private function completion(Request $request, Closure $next, int|string $userId, string $key): Response
    {
        $completion = FieldValidationCompletion::query()
            ->with('assignment')
            ->where('client_uuid', $key)
            ->first();

        if (! $completion) {
            return $next($request);
        }

        // The assignee may have changed since; completed_by_id is who finished it.
        $owner = $completion->completed_by_id ?? $completion->assignment?->assignee_id;
        $route = $request->route('assignment');
        $routeUuid = $route instanceof FieldValidationAssignment ? $route->uuid : $route;

        if ((int) $owner !== (int) $userId || $completion->assignment?->uuid !== $routeUuid) {
            return response()->json([
                'message' => 'The client uuid is unavailable. Use a new completion UUID.',
                'code' => 'CLIENT_UUID_CONFLICT',
                'client_uuid' => $key,
            ], 409);
        }

        return $this->receipt([
            'data' => ['completion' => [
                'uuid' => $completion->uuid,
                'client_uuid' => $completion->client_uuid,
                'assignment_uuid' => $completion->assignment->uuid,
            ]],
        ], $completion->created_at);
    }

    /**
     * @param  array<string, mixed>  $body
     */
    private function receipt(array $body, mixed $receivedAt): JsonResponse
    {
        return response()->json([
            ...$body,
            'replayed' => true,
            'received_at' => $receivedAt->utc()->toISOString(),
        ]);
    }
}
