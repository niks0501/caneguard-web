<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SecurityAudit;
use App\Support\AerialSwitch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Admin on/off for the aerial check. The server install flag stays the capability gate. */
final class AerialAnalysisSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(['data' => [
            'installed' => AerialSwitch::installed(),
            'enabled' => AerialSwitch::switchedOn(),
        ]])->header('Cache-Control', 'private, no-store');
    }

    public function update(Request $request): JsonResponse
    {
        $input = $request->validate(['enabled' => ['required', 'boolean']]);
        abort_unless(AerialSwitch::installed(), 409, 'The aerial check is not installed on this server.');

        $actor = $request->user();
        $enabled = (bool) $input['enabled'];
        DB::transaction(function () use ($actor, $enabled): void {
            DB::table('feature_switches')->updateOrInsert(
                ['name' => AerialSwitch::NAME],
                ['enabled' => $enabled, 'updated_by_id' => $actor->getKey(), 'updated_at' => now()->utc(), 'created_at' => now()->utc()],
            );
            SecurityAudit::query()->create([
                'actor_id' => $actor->getKey(),
                'target_user_id' => $actor->getKey(),
                'action' => SecurityAudit::ACTION_AERIAL_SWITCH,
                'outcome' => SecurityAudit::OUTCOME_SUCCESS,
                'metadata' => ['enabled' => $enabled],
                'created_at' => now()->utc(),
            ]);
        });

        return $this->show();
    }
}
