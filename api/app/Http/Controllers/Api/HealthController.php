<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

final class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $checks = [
            'database' => $this->databaseIsReady(),
            'storage' => $this->storageIsReady(),
        ];
        $ready = ! in_array(false, $checks, true);

        return response()->json([
            'data' => [
                'status' => $ready ? 'ok' : 'degraded',
                'checks' => [
                    'database' => $checks['database'] ? 'ready' : 'unavailable',
                    'storage' => $checks['storage'] ? 'ready' : 'unavailable',
                ],
            ],
        ], $ready ? 200 : 503);
    }

    private function databaseIsReady(): bool
    {
        try {
            DB::select('SELECT 1');

            return true;
        } catch (Throwable) {
            Log::warning('Health check database dependency is unavailable.');

            return false;
        }
    }

    private function storageIsReady(): bool
    {
        try {
            $path = Storage::disk('local')->path('');

            return is_dir($path) && is_writable($path);
        } catch (Throwable) {
            Log::warning('Health check storage dependency is unavailable.');

            return false;
        }
    }
}
