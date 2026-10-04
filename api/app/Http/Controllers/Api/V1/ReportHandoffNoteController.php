<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\RecordHandoffNoteRequest;
use App\Http\Resources\ReportResource;
use App\Models\Report;
use App\Models\ReportHandoffNote;
use Illuminate\Support\Facades\DB;

class ReportHandoffNoteController extends Controller
{
    public function __invoke(RecordHandoffNoteRequest $request, Report $report): ReportResource
    {
        $data = $request->validated();
        DB::transaction(function () use ($request, $report, $data): void {
            $locked = Report::query()->lockForUpdate()->findOrFail($report->getKey());
            abort_unless($locked->lock_version === $data['expected_version'], 409);
            ReportHandoffNote::query()->create([
                'report_id' => $locked->getKey(),
                'recorded_by_id' => $request->user()->getKey(),
                'destination' => trim($data['destination']),
                'reference' => trim($data['reference'] ?? '') ?: null,
                'sent_date' => $data['sent_date'],
                'note' => trim($data['note'] ?? '') ?: null,
                'advice_received_note' => trim($data['advice_received_note'] ?? '') ?: null,
                'created_at' => now()->utc(),
            ]);
            // A plain record: no consult, lifecycle transition, due date, or notification.
            $locked->update(['lock_version' => $locked->lock_version + 1]);
        });

        return new ReportResource($report->refresh()->load([
            'reporter', 'reviewer', 'advisory', 'classScores', 'symptoms', 'qualityWarnings',
            'audits.actor', 'referral.officeReviewer', 'referrals', 'handoffNotes',
        ]));
    }
}
