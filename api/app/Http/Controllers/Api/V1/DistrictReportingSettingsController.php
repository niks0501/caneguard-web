<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\CheckStepUpPassword;
use App\Http\Controllers\Controller;
use App\Models\District;
use App\Models\SecurityAudit;
use App\Security\DistrictAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** A configurable preparation reminder only. It never prepares, approves or sends. */
final class DistrictReportingSettingsController extends Controller
{
    public function show(Request $request, DistrictAccess $access): JsonResponse
    {
        abort_unless($access->office($request->user()), 403);
        $settings = DB::table('district_reporting_settings')->where('district_id', $access->pilotId())->first();

        return response()->json(['data' => [
            'reminder_day' => $settings?->reminder_day,
            'reminder_time' => $settings?->reminder_time,
            'timezone' => 'Asia/Manila',
            'can_manage' => $access->grant($request->user(), 'staff:manage', $access->pilotId()) !== null,
        ]])->header('Cache-Control', 'private, no-store');
    }

    public function update(Request $request, DistrictAccess $access, CheckStepUpPassword $stepUp): JsonResponse
    {
        $actor = $request->user();
        abort_unless($access->grant($actor, 'staff:manage', $access->pilotId()) !== null, 403);
        $input = $request->validate([
            'reminder_day' => ['required', 'integer', 'between:1,7'],
            'reminder_time' => ['required', 'regex:/^(?:[01]\d|2[0-3]):[0-5]\d$/'],
            'office_reference' => ['required', 'string', 'max:160'],
            'current_password' => ['required', 'string', 'max:255'],
        ]);
        abort_unless($stepUp->handle($actor, $input['current_password'], 'district_reporting_settings_changed', $actor), 403);
        DB::transaction(function () use ($access, $actor, $input): void {
            District::query()->whereKey($access->pilotId())->lockForUpdate()->firstOrFail();
            $grant = $access->grant($actor->fresh(), 'staff:manage', $access->pilotId());
            abort_unless($grant !== null, 403);
            DB::table('district_reporting_settings')->updateOrInsert(['district_id' => $access->pilotId()], [
                'reminder_day' => $input['reminder_day'], 'reminder_time' => $input['reminder_time'],
                'office_reference' => $input['office_reference'], 'updated_by_id' => $actor->id,
                'created_at' => now()->utc(), 'updated_at' => now()->utc(),
            ]);
            SecurityAudit::query()->create(['actor_id' => $actor->id, 'target_user_id' => $actor->id, 'action' => 'district_reporting_settings_changed', 'outcome' => 'success', 'created_at' => now()->utc(),
                'metadata' => ['district_id' => $access->pilotId(), 'grant_id' => $grant->id, 'grant_revision' => $grant->revision, 'office_reference' => $input['office_reference'], 'reminder_day' => $input['reminder_day'], 'reminder_time' => $input['reminder_time']]]);
        });

        return $this->show($request, $access);
    }
}
