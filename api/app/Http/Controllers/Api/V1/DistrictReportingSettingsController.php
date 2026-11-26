<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\CheckStepUpPassword;
use App\Console\Commands\GenerateWeeklyReports;
use App\Http\Controllers\Controller;
use App\Models\District;
use App\Models\SecurityAudit;
use App\Security\DistrictAccess;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

/** Weekly report auto-generation and reminder schedule (Asia/Manila). Never approves or emails automatically. */
final class DistrictReportingSettingsController extends Controller
{
    public function show(Request $request, DistrictAccess $access): JsonResponse
    {
        Gate::authorize('update', District::findOrFail($access->pilotId()));
        $settings = DB::table('district_reporting_settings')->where('district_id', $access->pilotId())->first();

        return response()->json(['data' => [
            'reminder_day' => $settings?->reminder_day,
            'reminder_time' => $settings?->reminder_time,
            'auto_generate_enabled' => $settings === null ? true : (bool) ($settings->auto_generate_enabled ?? true),
            'auto_generate_day' => (int) ($settings->auto_generate_day ?? GenerateWeeklyReports::DEFAULT_DAY),
            'auto_generate_time' => (string) ($settings->auto_generate_time ?? GenerateWeeklyReports::DEFAULT_TIME),
            'last_auto_generated_at' => $settings?->last_auto_generated_at
                ? CarbonImmutable::parse((string) $settings->last_auto_generated_at, 'UTC')->toIso8601String()
                : null,
            'last_auto_status' => $settings?->last_auto_status,
            'last_auto_week' => $settings?->last_auto_week,
            'timezone' => 'Asia/Manila',
            'can_manage' => true,
        ]])->header('Cache-Control', 'private, no-store');
    }

    public function update(Request $request, DistrictAccess $access, CheckStepUpPassword $stepUp): JsonResponse
    {
        $actor = $request->user();
        $input = $request->validate([
            'reminder_day' => ['sometimes', 'nullable', 'integer', 'between:1,7'],
            'reminder_time' => ['sometimes', 'nullable', 'regex:/^(?:[01]\d|2[0-3]):[0-5]\d$/'],
            'auto_generate_enabled' => ['sometimes', 'boolean'],
            'auto_generate_day' => ['sometimes', 'integer', 'between:1,7'],
            'auto_generate_time' => ['sometimes', 'regex:/^(?:[01]\d|2[0-3]):[0-5]\d$/'],
            'office_reference' => ['required', 'string', 'max:160'],
            'current_password' => ['required', 'string', 'max:255'],
        ]);
        abort_unless($stepUp->handle($actor, $input['current_password'], 'district_reporting_settings_changed', $actor), 403);
        DB::transaction(function () use ($access, $actor, $input): void {
            $district = District::query()->whereKey($access->pilotId())->lockForUpdate()->firstOrFail();
            Gate::forUser($actor->fresh())->authorize('update', $district);
            $existing = DB::table('district_reporting_settings')->where('district_id', $district->id)->first();
            $autoEnabled = array_key_exists('auto_generate_enabled', $input)
                ? (bool) $input['auto_generate_enabled']
                : ($existing === null ? true : (bool) ($existing->auto_generate_enabled ?? true));
            $autoDay = (int) ($input['auto_generate_day'] ?? $existing->auto_generate_day ?? GenerateWeeklyReports::DEFAULT_DAY);
            $autoTime = (string) ($input['auto_generate_time'] ?? $existing->auto_generate_time ?? GenerateWeeklyReports::DEFAULT_TIME);
            $reminderDay = array_key_exists('reminder_day', $input) ? $input['reminder_day'] : $existing?->reminder_day;
            $reminderTime = array_key_exists('reminder_time', $input) ? $input['reminder_time'] : $existing?->reminder_time;

            DB::table('district_reporting_settings')->updateOrInsert(['district_id' => $district->id], [
                'reminder_day' => $reminderDay,
                'reminder_time' => $reminderTime,
                'auto_generate_enabled' => $autoEnabled,
                'auto_generate_day' => $autoDay,
                'auto_generate_time' => $autoTime,
                'office_reference' => $input['office_reference'],
                'updated_by_id' => $actor->id,
                'created_at' => $existing?->created_at ?? now()->utc(),
                'updated_at' => now()->utc(),
            ]);
            SecurityAudit::query()->create(['actor_id' => $actor->id, 'target_user_id' => $actor->id, 'action' => 'district_reporting_settings_changed', 'outcome' => 'success', 'created_at' => now()->utc(),
                'metadata' => [
                    'office_reference' => $input['office_reference'],
                    'reminder_day' => $reminderDay,
                    'reminder_time' => $reminderTime,
                    'auto_generate_enabled' => $autoEnabled,
                    'auto_generate_day' => $autoDay,
                    'auto_generate_time' => $autoTime,
                ]]);
        });

        return $this->show($request, $access);
    }
}
