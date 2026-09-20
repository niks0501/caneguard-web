<?php

namespace App\Actions\Reports;

use App\Models\Report;
use Illuminate\Support\Facades\Schema;

class RecordReportReviewEvent
{
    /**
     * Review history is an optional expansion of the report schema. Keep the
     * core review/referral mutation available while older deployments catch up.
     *
     * @param  array<string, mixed>  $data
     */
    public function handle(Report $report, array $data): void
    {
        if (! Schema::hasTable('report_review_events')) {
            return;
        }

        $report->reviewEvents()->create($data);
    }
}
