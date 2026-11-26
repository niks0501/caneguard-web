<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ReportAerialAnalysis;
use App\Support\AerialSwitch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/** Admin on/off for the aerial check. The server install flag stays the capability gate. */
final class AerialAnalysisSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        $modelPath = config('caneguard.aerial.model_path');
        $storageDir = Storage::disk('local')->path('aerial');

        return response()->json(['data' => [
            'installed' => AerialSwitch::installed(),
            'enabled' => AerialSwitch::switchedOn(),
            'model_version' => (string) config('caneguard.aerial.model_version', 'aerial-v3'),
            'retention_days' => (int) config('caneguard.aerial.removed_retention_days', 30),
            'counts' => [
                'active' => ReportAerialAnalysis::query()->whereNull('removed_at')->count(),
                'removed' => ReportAerialAnalysis::query()->whereNotNull('removed_at')->count(),
            ],
            'readiness' => [
                'model_configured' => is_string($modelPath) && $modelPath !== '' && is_file($modelPath) && is_readable($modelPath),
                'storage_writable' => is_dir($storageDir) && is_writable($storageDir),
                'timeout_seconds' => (int) config('caneguard.aerial.timeout_seconds', 60),
            ],
        ]]);
    }

    public function update(Request $request): JsonResponse
    {
        $input = $request->validate(['enabled' => ['required', 'boolean']]);
        abort_unless(AerialSwitch::installed(), 409, 'The aerial check is not installed on this server.');

        DB::table('feature_switches')->upsert(
            [['name' => AerialSwitch::NAME, 'enabled' => (bool) $input['enabled']]],
            ['name'],
            ['enabled'],
        );

        return $this->show();
    }
}
