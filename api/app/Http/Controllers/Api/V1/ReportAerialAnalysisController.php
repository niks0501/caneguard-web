<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\AnalyzeAerialImage;
use App\Http\Controllers\Controller;
use App\Http\Resources\ReportAerialAnalysisResource;
use App\Models\Report;
use App\Models\ReportAerialAnalysis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\File;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Experimental aerial canopy check. Every action is dark unless the server
 * flag is on, and none of it feeds the case's GPS/polygon or review data.
 */
class ReportAerialAnalysisController extends Controller
{
    public function store(Request $request, Report $report, AnalyzeAerialImage $analyze): JsonResponse
    {
        $this->gate($report);

        $max = (int) config('caneguard.aerial.max_side_px', 10000);
        $request->validate([
            'image' => [
                'required',
                File::image()->types(['jpg', 'jpeg', 'png', 'webp'])
                    ->max((int) config('caneguard.aerial.max_upload_kib', 20480))
                    ->dimensions(Rule::dimensions()->maxWidth($max)->maxHeight($max)),
            ],
        ]);

        $analysis = $analyze->handle($report, $request->user(), $request->file('image'));

        return (new ReportAerialAnalysisResource($analysis->load(['report', 'uploader'])))
            ->response()
            ->setStatusCode(201);
    }

    public function image(Report $report, ReportAerialAnalysis $analysis): StreamedResponse
    {
        $this->gate($report, $analysis);

        return $this->stream($analysis->image_path, $analysis->image_mime_type);
    }

    public function mask(Report $report, ReportAerialAnalysis $analysis): StreamedResponse
    {
        $this->gate($report, $analysis);

        return $this->stream($analysis->mask_path, 'image/png');
    }

    public function destroy(Request $request, Report $report, ReportAerialAnalysis $analysis): JsonResponse
    {
        $this->gate($report, $analysis);

        $removalId = (string) Str::uuid();
        $removed = ReportAerialAnalysis::query()
            ->whereKey($analysis->getKey())
            ->whereNull('removed_at')
            ->update([
                'removed_at' => now(),
                'removed_by' => $request->user()->getKey(),
                'removal_id' => $removalId,
            ]);

        abort_if($removed === 0, 404);

        return response()->json(['data' => ['removal_id' => $removalId]]);
    }

    /** Undoes the named removal; restoring an active check is a no-op. */
    public function restore(Request $request, Report $report, ReportAerialAnalysis $analysis): JsonResponse
    {
        $this->gate($report, $analysis, allowRemoved: true);

        $request->validate(['removal_id' => ['required', 'uuid']]);
        $removalId = (string) $request->input('removal_id');
        $restored = ReportAerialAnalysis::query()
            ->whereKey($analysis->getKey())
            ->where('removal_id', $removalId)
            ->whereNotNull('removed_at')
            ->update(['removed_at' => null, 'removed_by' => null]);

        if ($restored === 0) {
            $current = $analysis->fresh();
            abort_if(
                $current === null
                    || $current->removal_id !== $removalId
                    || $current->removed_at !== null,
                409,
                'The check was changed by someone else.',
            );
        }

        $analysis->refresh();

        return (new ReportAerialAnalysisResource($analysis->load(['report', 'uploader'])))->response();
    }

    private function gate(Report $report, ?ReportAerialAnalysis $analysis = null, bool $allowRemoved = false): void
    {
        abort_unless(config('caneguard.aerial.enabled') === true, 404);
        $this->authorize('review', $report);
        abort_if(
            $analysis !== null
                && ($analysis->report_id !== $report->getKey() || (! $allowRemoved && $analysis->removed_at !== null)),
            404,
        );
    }

    private function stream(string $path, string $mime): StreamedResponse
    {
        abort_unless(Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, null, [
            'Content-Type' => $mime,
            'Cache-Control' => 'private, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
