<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\CheckStepUpPassword;
use App\Http\Controllers\Controller;
use App\Models\District;
use App\Models\DistrictRecipientSet;
use App\Models\SecurityAudit;
use App\Security\DistrictAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/** Official weekly-report recipients. Sets are immutable: replacing revokes the old set and creates a new one. */
final class DistrictRecipientSetController extends Controller
{
    private const HISTORY_LIMIT = 20;

    public function index(Request $request, DistrictAccess $access): JsonResponse
    {
        Gate::authorize('update', District::findOrFail($access->pilotId()));
        $sets = DistrictRecipientSet::query()->where('district_id', $access->pilotId())
            ->orderByDesc('id')->limit(self::HISTORY_LIMIT)->get();

        return response()->json(['data' => $sets->map(fn (DistrictRecipientSet $set): array => [
            'id' => $set->id,
            'recipients' => $set->recipients,
            'office_reference' => $set->office_reference,
            'created_at' => $set->created_at?->toIso8601String(),
            'revoked_at' => $set->revoked_at?->toIso8601String(),
        ])->values()])->header('Cache-Control', 'private, no-store');
    }

    public function replace(Request $request, DistrictAccess $access, CheckStepUpPassword $stepUp): JsonResponse
    {
        $actor = $request->user();
        $input = $request->validate([
            'recipients' => ['required', 'array', 'min:1', 'max:20'],
            'recipients.*' => ['required', 'string', 'email:strict', 'max:254'],
            'office_reference' => ['required', 'string', 'max:160'],
            'current_password' => ['required', 'string', 'max:255'],
        ]);
        $recipients = collect($input['recipients'])->map(fn (string $email) => trim($email))
            ->unique(fn (string $email) => strtolower($email))->values()->all();
        abort_unless($stepUp->handle($actor, $input['current_password'], 'district_recipient_set_replaced', $actor), 403);
        DB::transaction(function () use ($access, $actor, $input, $recipients): void {
            $district = District::query()->whereKey($access->pilotId())->lockForUpdate()->firstOrFail();
            Gate::forUser($actor->fresh())->authorize('update', $district);
            $revoked = 0;
            DistrictRecipientSet::query()->where('district_id', $district->id)->whereNull('revoked_at')->lockForUpdate()->get()
                ->each(function (DistrictRecipientSet $set) use (&$revoked): void {
                    $set->update(['revoked_at' => now()->utc()]);
                    $revoked++;
                });
            $set = DistrictRecipientSet::query()->create([
                'district_id' => $district->id, 'recipients' => $recipients, 'office_reference' => $input['office_reference'],
            ]);
            SecurityAudit::query()->create([
                'actor_id' => $actor->id, 'target_user_id' => $actor->id, 'action' => 'district_recipient_set_replaced', 'outcome' => 'success',
                'created_at' => now()->utc(),
                'metadata' => ['office_reference' => $input['office_reference'], 'recipient_set_id' => $set->id, 'recipient_count' => count($recipients), 'revoked_sets' => $revoked],
            ]);
        });

        return $this->index($request, $access);
    }
}
