<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\IssueConsultInviteRequest;
use App\Models\Report;
use App\Models\ReportReferral;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

class IssueConsultInviteController extends Controller
{
    public function __invoke(
        IssueConsultInviteRequest $request,
        Report $report,
    ): JsonResponse {
        if (app()->environment('production') && ! $request->isSecure()) {
            abort(HttpResponse::HTTP_BAD_REQUEST, 'Consult links require HTTPS.');
        }

        $token = Str::random(64);
        $expiresAt = CarbonImmutable::now(config('app.timezone'))
            ->addDays((int) config('caneguard.expert_consult_invite_days', 7));
        $shareFullContext = $request->has('share_full_context')
            ? $request->boolean('share_full_context')
            : null;

        $consult = DB::transaction(function () use (
            $report,
            $request,
            $token,
            $expiresAt,
            $shareFullContext,
        ): ReportReferral {
            $lockedReport = Report::query()
                ->lockForUpdate()
                ->findOrFail($report->getKey());
            $consult = $lockedReport->referrals()
                ->latest('id')
                ->lockForUpdate()
                ->first();

            abort_unless($consult !== null, 404, 'No expert consult is recorded for this case.');
            if (! $consult->isActive()) {
                abort(422, 'Only an active expert consult can receive a consult link.');
            }

            $original = [
                'issued_at' => $consult->invite_issued_at?->utc()->toISOString(),
                'expires_at' => $consult->invite_expires_at?->utc()->toISOString(),
                'revoked_at' => $consult->invite_revoked_at?->utc()->toISOString(),
            ];
            $consult->update([
                'invite_token_hash' => hash('sha256', $token),
                'invite_issued_at' => $expiresAt->copy()->subDays((int) config('caneguard.expert_consult_invite_days', 7)),
                'invite_expires_at' => $expiresAt,
                'invite_revoked_at' => null,
                'invite_access_count' => 0,
                'invite_first_accessed_at' => null,
                'invite_last_accessed_at' => null,
                ...($shareFullContext === null ? [] : [
                    'share_full_context' => $shareFullContext,
                ]),
            ]);

            $lockedReport->audits()->create([
                'actor_id' => $request->user()->getKey(),
                'field' => 'expert_consult_invite',
                'original_value' => $original,
                'corrected_value' => [
                    'consult_id' => $consult->getKey(),
                    'expires_at' => $expiresAt->utc()->toISOString(),
                    'share_full_context' => (bool) $consult->share_full_context,
                ],
                'reason' => 'Issued a signed external consult link.',
                'created_at' => now()->utc(),
            ]);

            return $consult->fresh();
        });

        $url = URL::temporarySignedRoute(
            'api.v1.consult-invites.show',
            $consult->invite_expires_at,
            ['token' => $token],
            false,
        );
        $photoUrl = URL::temporarySignedRoute(
            'api.v1.consult-invites.image',
            $consult->invite_expires_at,
            ['token' => $token],
            false,
        );

        return response()->json([
            'data' => [
                'url' => $url,
                'photo_url' => $photoUrl,
                'consult_id' => $consult->getKey(),
                'issued_at' => $consult->invite_issued_at?->utc()->toISOString(),
                'expires_at' => $consult->invite_expires_at?->utc()->toISOString(),
                'revoked_at' => null,
                'access_count' => $consult->invite_access_count,
                'share_full_context' => (bool) $consult->share_full_context,
            ],
        ], 201);
    }
}
