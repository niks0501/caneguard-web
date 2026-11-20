<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
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
