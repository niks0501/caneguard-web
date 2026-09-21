<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Reports\BuildConsultInvitePayload;
use App\Http\Controllers\Controller;
use App\Models\ReportReferral;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response as HttpResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ConsultInviteController extends Controller
{
    public function __invoke(
        Request $request,
        string $token,
        BuildConsultInvitePayload $payloadBuilder,
    ): JsonResponse {
        if (app()->environment('production') && ! $request->isSecure()) {
            abort(HttpResponse::HTTP_BAD_REQUEST, 'Consult links require HTTPS.');
        }

        $consult = $this->recordAccess($token);
        $report = $consult->report()->with([
            'symptoms',
        ])->firstOrFail();

        return response()
            ->json(['data' => $payloadBuilder->handle($report, $consult, $token)])
            ->header('Cache-Control', 'no-store')
            ->header('X-Robots-Tag', 'noindex, nofollow')
            ->header('X-Content-Type-Options', 'nosniff');
    }

    public function image(Request $request, string $token): StreamedResponse
    {
        if (app()->environment('production') && ! $request->isSecure()) {
            abort(HttpResponse::HTTP_BAD_REQUEST, 'Consult links require HTTPS.');
        }

        $consult = $this->recordAccess($token);
        $report = $consult->report()->firstOrFail();

        abort_unless(
            Storage::disk('local')->exists($report->image_path),
            HttpResponse::HTTP_NOT_FOUND,
        );

        return Storage::disk('local')->response(
            $report->image_path,
            null,
            [
                'Content-Type' => $report->image_mime_type,
                'Cache-Control' => 'no-store',
                'X-Robots-Tag' => 'noindex, nofollow',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }

    private function recordAccess(string $token): ReportReferral
    {
        $hash = hash('sha256', $token);

        return DB::transaction(function () use ($hash): ReportReferral {
            $consult = ReportReferral::query()
                ->where('invite_token_hash', $hash)
                ->lockForUpdate()
                ->first();

            if (
                $consult === null
                || $consult->invite_issued_at === null
                || $consult->invite_revoked_at !== null
                || ! $consult->isActive()
                || $consult->invite_expires_at === null
                || $consult->invite_expires_at->isPast()
            ) {
                abort(HttpResponse::HTTP_FORBIDDEN, 'This consult link is no longer available.');
            }

            $now = now()->utc();
            $consult->update([
                'invite_access_count' => ((int) $consult->invite_access_count) + 1,
                'invite_first_accessed_at' => $consult->invite_first_accessed_at ?? $now,
                'invite_last_accessed_at' => $now,
            ]);

            return $consult->fresh();
        });
    }
}
