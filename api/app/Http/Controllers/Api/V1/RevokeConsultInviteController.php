<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Report;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class RevokeConsultInviteController extends Controller
{
    public function __invoke(Report $report): JsonResponse
    {
        $this->authorize('review', $report);

        $consult = DB::transaction(function () use ($report): mixed {
            $lockedReport = Report::query()
                ->lockForUpdate()
                ->findOrFail($report->getKey());
            $consult = $lockedReport->referrals()
                ->latest('id')
                ->lockForUpdate()
                ->first();

            abort_unless($consult !== null, 404, 'No expert consult is recorded for this case.');

            if ($consult->invite_issued_at !== null && $consult->invite_revoked_at === null) {
                $consult->update(['invite_revoked_at' => now()->utc()]);
                $lockedReport->audits()->create([
                    'actor_id' => request()->user()->getKey(),
                    'field' => 'expert_consult_invite',
                    'original_value' => [
                        'issued_at' => $consult->invite_issued_at->utc()->toISOString(),
                        'expires_at' => $consult->invite_expires_at?->utc()->toISOString(),
                    ],
                    'corrected_value' => [
                        'consult_id' => $consult->getKey(),
                        'revoked_at' => $consult->fresh()->invite_revoked_at?->utc()->toISOString(),
                    ],
                    'reason' => 'Revoked a signed external consult link.',
                    'created_at' => now()->utc(),
                ]);
            }

            return $consult->fresh();
        });

        return response()->json([
            'data' => [
                'consult_id' => $consult->getKey(),
                'issued_at' => $consult->invite_issued_at?->utc()->toISOString(),
                'expires_at' => $consult->invite_expires_at?->utc()->toISOString(),
                'revoked_at' => $consult->invite_revoked_at?->utc()->toISOString(),
                'access_count' => $consult->invite_access_count,
                'share_full_context' => (bool) $consult->share_full_context,
            ],
        ]);
    }
}
