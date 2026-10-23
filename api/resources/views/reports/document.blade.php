@php($isPdfDocument = request()->routeIs('api.v1.reports.documents.pdf') || request()->input('format') === 'pdf')
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CaneGuard report · {{ $period['label'] }}</title>
    <style nonce="{{ request()->attributes->get('csp_nonce') }}">
        @font-face { font-family: Poppins; font-style: normal; font-weight: 400; src: url('/fonts/Poppins-Regular.ttf') format('truetype'); }
        @font-face { font-family: Poppins; font-style: normal; font-weight: 600; src: url('/fonts/Poppins-SemiBold.ttf') format('truetype'); }
        @font-face { font-family: Poppins; font-style: normal; font-weight: 700; src: url('/fonts/Poppins-Bold.ttf') format('truetype'); }
        html { font-family: Poppins, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f3025; background: #f4f6f2; }
        * { box-sizing: border-box; }
        @page { size: A4; margin: 18mm 15mm; }
        @if (! $isPdfDocument)
        @page { @bottom-left { content: "CaneGuard · {{ $period['label'] }} · generated {{ $generated_at }}"; color: #657568; font-size: 8pt; } @bottom-right { content: "Page " counter(page) " of " counter(pages); color: #657568; font-size: 8pt; } }
        @endif
        body { margin: 0; padding: 30px 18px 50px; font-size: 14px; line-height: 1.5; }
        body.pdf-render { padding: 0; font-family: Poppins, sans-serif; font-size: 10pt; }
        .document { width: 100%; max-width: 980px; margin: 0 auto; padding: 34px; background: #fff; border: 1px solid #d8e1d7; }
        body.pdf-render .document { padding: 0; border: 0; }
        .print-actions { margin-bottom: 18px; text-align: right; }
        .print-actions button { margin-left: 10px; border: 0; border-radius: 7px; padding: 10px 14px; color: #fff; background: #2d6b40; font: inherit; font-weight: 600; cursor: pointer; }
        .print-actions button.secondary { color: #1e452a; background: #eaf3e9; }
        .masthead { display: table; width: 100%; padding-bottom: 24px; border-bottom: 2px solid #2d6b40; }
        .masthead > div { display: table-cell; vertical-align: top; }
        .lockup { width: 225px; padding-right: 12px; color: #1e452a; font-size: 18px; font-weight: 700; }
        .lockup img { width: 44px; height: 44px; vertical-align: middle; }
        .lockup span { display: inline-block; vertical-align: middle; }
        .eyebrow { margin: 0 0 5px; color: #2d6b40; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
        h1, h2 { margin: 0; color: #1e452a; }
        h1 { font-size: 26px; line-height: 1.2; }
        h2 { margin-bottom: 12px; font-size: 16px; }
        h3 { margin: 0 0 6px; color: #1e452a; font-size: 13px; }
        .intro { margin: 8px 0 0; color: #657568; }
        .meta { margin: 9px 0 0; color: #657568; font-size: 11px; }
        .notice { margin: 18px 0 0; padding: 11px 13px; color: #5e5426; background: #f7f1d8; border: 1px solid #e5dcad; border-radius: 7px; }
        .partial { color: #7c5919; background: #fff7df; border-color: #e5c778; }
        section { padding: 24px 0; border-bottom: 1px solid #d8e1d7; }
        .section-band { margin: -24px 0 18px; padding: 8px 10px; color: #1e452a; background: #f3f7f1; border-left: 4px solid #2d6b40; font-family: Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        .metrics { width: 100%; margin: 0 0 10px; border-collapse: separate; border-spacing: 10px 0; table-layout: fixed; }
        .metrics td.metric { width: 33.333%; padding: 14px; background: #eaf3e9; border: 1px solid #d5e5d3; vertical-align: top; page-break-inside: avoid; }
        .metric-label { display: block; color: #657568; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
        .metric-value { display: block; margin-top: 4px; color: #1e452a; font-size: 24px; font-weight: 700; }
        .metric-unit { color: #657568; font-size: 11px; }
        .columns { display: table; width: 100%; table-layout: fixed; border-spacing: 20px 0; margin: 0 -20px; }
        .column { display: table-cell; width: 50%; vertical-align: top; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { padding: 8px 7px; color: #657568; background: #f3f7f1; font-size: 10px; text-align: left; text-transform: uppercase; letter-spacing: .05em; }
        td { padding: 8px 7px; border-bottom: 1px solid #e8eee6; vertical-align: top; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        .bar-chart { display: block; width: 100%; height: 180px; border-bottom: 1px solid #d8e1d7; }
        .bar-chart rect { fill: #2d6b40; }
        .bar-chart text { fill: #657568; font-family: Helvetica, Arial, sans-serif; font-size: 9px; }
        .muted { color: #657568; }
        .danger { color: #a34837; }
        .appendix-warning { margin-bottom: 14px; padding: 10px 12px; color: #714c1a; background: #fff5da; border: 1px solid #e5cf99; }
        .appendix-reference { color: #714c1a; font-size: 10px; font-style: italic; }
        .empty { padding: 20px; color: #657568; background: #f3f7f1; text-align: center; }
        .document-footer { padding-top: 18px; color: #657568; font-size: 11px; }
        body.pdf-render .document-footer { position: fixed; right: 0; bottom: -12mm; left: 0; padding-top: 4px; border-top: 1px solid #d8e1d7; background: #fff; font-size: 8pt; }
        body.pdf-render .document-footer::after { float: right; content: "Page " counter(page); }
        .supplementary-metrics { padding: 18px 0; border-bottom: 1px solid #d8e1d7; }
        .supplementary-metrics summary { color: #1e452a; font-weight: 600; cursor: pointer; }
        .supplementary-metrics > section { padding: 18px 0 0; }
        body.pdf-render .print-actions { display: none; }
        @media (max-width: 700px) { body { padding: 0; } .document { width: 100%; padding: 22px 18px; border: 0; } .masthead, .columns { display: block; } .masthead > div, .column { display: block; width: 100%; } .lockup { margin-bottom: 18px; } .column { margin-bottom: 22px; } .metrics, .metrics tbody, .metrics tr { display: block; } .metrics td.metric { display: block; width: 100%; margin-bottom: 8px; } }
        body.pdf-render .masthead, body.pdf-render .metrics { display: table; }
        body.pdf-render .masthead > div, body.pdf-render .metrics td.metric { display: table-cell; }
        body.pdf-render .columns { display: table; }
        body.pdf-render .column { display: table-cell; width: 50%; margin-bottom: 0; }
        body.pdf-render .metrics tbody { display: table-row-group; }
        body.pdf-render .metrics tr { display: table-row; }
        body.pdf-render .metrics td.metric { width: 33.333%; }
        @media print { body { padding: 0; font-size: 10pt; } .document { width: 100%; padding: 0; border: 0; } .print-actions { display: none; } .document-footer { page-break-inside: avoid; } }
    </style>
</head>
<body class="{{ $isPdfDocument ? 'pdf-render' : '' }}">
<main class="document">
    <div class="print-actions" aria-label="Document actions">
        <button type="button" id="print-report">Print</button>
        <button type="button" class="secondary" id="download-report">Download PDF</button>
    </div>
    <header class="masthead">
        <div class="lockup"><img src="/brand/CaneGuard_logo_flat.svg" alt=""> <span>CaneGuard</span></div>
        <div>
            <p class="eyebrow">Submitted case report</p>
            <h1>{{ $period['label'] }}</h1>
            <p class="meta">Generated {{ $generated_at }} · by {{ $generated_by }} · {{ $period['timezone_label'] }} document boundary</p>
            <p class="meta">Scope: {{ $filter_summary }}</p>
        </div>
    </header>
    <p class="notice">Operational report counts only, not population-level disease statistics. Possible Condition is decision support only and is not a diagnosis or authority finding.</p>
    @if ($period['partial']) <p class="notice partial">This report includes a period that is still in progress. Treat the counts as partial.</p> @endif

    <section aria-labelledby="key-figures"><div class="section-band" id="key-figures">Operational summary</div>
        <table class="metrics"><tbody>
            <tr><td class="metric"><span class="metric-label">Submitted reports</span><span class="metric-value">{{ number_format($metrics['reported_cases']) }}</span><span class="metric-unit">submitted case records</span></td>
                <td class="metric"><span class="metric-label">Estimated affected area</span><span class="metric-value">{{ number_format($metrics['estimated_affected_hectares'], 2) }}</span><span class="metric-unit">hectares</span></td>
                <td class="metric"><span class="metric-label">Reports with farmer/farm information</span><span class="metric-value">{{ number_format($metrics['reports_containing_farmer_farm_information']) }}</span><span class="metric-unit">submitted case records</span></td></tr>
            <tr><td class="metric"><span class="metric-label">Reports requiring field validation</span><span class="metric-value">{{ number_format($operational_queues['needs_visit']) }}</span><span class="metric-unit">open visits, including unassigned legacy work</span></td>
                <td class="metric"><span class="metric-label">Open submitted reports</span><span class="metric-value">{{ number_format($metrics['reported_cases'] - $metrics['closed_cases']) }}</span><span class="metric-unit">in this period</span></td>
                <td class="metric"><span class="metric-label">Closed submitted reports</span><span class="metric-value">{{ number_format($metrics['closed_cases']) }}</span><span class="metric-unit">in this period</span></td></tr>
        </tbody></table>
        <p class="muted">The farmer/farm-information value counts submitted case records containing that information; it is not an estimate of total affected farmers in Nasugbu. Estimated affected hectares is a separate reported-area metric, and reports may describe overlapping ground.</p>
    </section>

    <section aria-labelledby="distribution"><div class="section-band" id="distribution">Distribution</div><div class="columns"><div class="column"><h3>By barangay</h3><table><thead><tr><th>Barangay</th><th>Submitted reports</th></tr></thead><tbody>@forelse ($metrics['cases_by_barangay'] as $row)<tr><td>{{ $row['barangay'] ?: 'Not provided' }}</td><td>{{ $row['reported_cases'] }}</td></tr>@empty<tr><td colspan="2" class="muted">No submitted reports in this period.</td></tr>@endforelse</tbody></table></div><div class="column"><h3>By Possible Condition</h3><table><thead><tr><th>Possible condition</th><th>Submitted reports</th></tr></thead><tbody>@forelse ($metrics['cases_by_possible_condition'] as $row)<tr><td>{{ $row['possible_condition'] ?: 'Not provided' }}</td><td>{{ $row['reported_cases'] }}</td></tr>@empty<tr><td colspan="2" class="muted">No submitted reports in this period.</td></tr>@endforelse</tbody></table></div></div></section>

    <section aria-labelledby="lifecycle"><div class="section-band" id="lifecycle">Field-validation workload</div><table><thead><tr><th>Validation state</th><th>Submitted reports</th></tr></thead><tbody>@foreach ($metrics['field_validation_counts'] as $state => $count)<tr><td>{{ str_replace('_', ' ', ucfirst($state)) }}</td><td>{{ $count }}</td></tr>@endforeach</tbody></table></section>

    @php($queueLabels = ['needs_review' => 'Needs Review', 'needs_visit' => 'Needs Visit', 'follow_up_due' => 'Follow-up Due', 'upcoming' => 'Upcoming Visits', 'unverified_no_active_work' => 'Unverified, no active work'])
    <section aria-labelledby="queues"><div class="section-band" id="queues">Operational queue status</div><p class="muted">These counts show submitted reports by current work queue. Follow-up Due reflects open validation work past its target date; Upcoming Visits includes target dates today or later.</p><table><thead><tr><th>Queue</th><th>Submitted reports</th></tr></thead><tbody>@foreach ($operational_queues as $queue => $count)<tr><td>{{ $queueLabels[$queue] ?? str_replace('_', ' ', ucfirst($queue)) }}</td><td class="{{ in_array($queue, ['follow_up_due', 'needs_visit'], true) && $count ? 'danger' : '' }}">{{ $count }}</td></tr>@endforeach</tbody></table></section>

    <details class="supplementary-metrics">
        <summary>Supplementary trend and review information</summary>
        <section aria-labelledby="submissions"><div class="section-band" id="submissions">Submissions over the period</div>
            @if (count($trend))
                @php($maxTrend = max(array_column($trend, 'count')))
                <svg class="bar-chart" viewBox="0 0 900 180" role="img" aria-label="Submissions trend">
                    @foreach ($trend as $index => $point)
                        @php($barHeight = max(2, round(($point['count'] / $maxTrend) * 125)))
                        @php($barX = 12 + ($index * (876 / max(1, count($trend)))) + 4)
                        @php($barWidth = max(5, (876 / max(1, count($trend))) - 8))
                        <rect x="{{ $barX }}" y="{{ 140 - $barHeight }}" width="{{ $barWidth }}" height="{{ $barHeight }}" rx="2"></rect>
                        <text x="{{ $barX + ($barWidth / 2) }}" y="160" text-anchor="middle">{{ $point['label'] }}</text>
                    @endforeach
                </svg>
            @else <div class="empty">No submitted reports in this period.</div> @endif
        </section>
        <section aria-labelledby="review-time"><h2 id="review-time">Review duration</h2><table><tbody><tr><td>Reviewed cases</td><td>{{ $metrics['review_time']['reviewed_cases'] }}</td></tr><tr><td>Average</td><td>{{ $metrics['review_time']['average_hours'] !== null ? $metrics['review_time']['average_hours'].' hours' : 'Not available' }}</td></tr><tr><td>Median</td><td>{{ $metrics['review_time']['median_hours'] !== null ? $metrics['review_time']['median_hours'].' hours' : 'Not available' }}</td></tr></tbody></table></section>
    </details>

    @if ($appendix_enabled)
    <section aria-labelledby="appendix"><div class="section-band" id="appendix">Case register appendix</div><div class="appendix-warning">{{ $appendix_warning }}</div><p class="appendix-reference">Farmer or farm reference — included because appendix was explicitly enabled.</p>@if ($appendix_capped)<p class="muted">This appendix is capped at 1,000 rows; continuation is not included.</p>@endif<table><thead><tr><th>Case</th><th>Submitted</th><th>Barangay</th><th>Farmer or farm reference</th><th>Possible condition</th><th>Status</th></tr></thead><tbody>@forelse ($appendix as $row)<tr><td>{{ $row['case_reference'] }}</td><td>{{ $row['submitted_date'] }}</td><td>{{ $row['barangay'] }}</td><td>{{ $row['farmer_or_farm_reference'] ?: 'Not provided' }}</td><td>{{ $row['possible_ai_condition'] }}</td><td>{{ $row['work_status'] }}</td></tr>@empty<tr><td colspan="6" class="muted">No submitted reports in this period.</td></tr>@endforelse</tbody></table></section>
    @endif
    <footer class="document-footer">CaneGuard · {{ $period['label'] }} · {{ $period['timezone_label'] }} · Generated {{ $generated_at }} · Page numbers appear in the print footer.</footer>
</main>
<script nonce="{{ request()->attributes->get('csp_nonce') }}">
    (() => {
        // The embedding Web application is a different origin in the documented
        // local setup. Both directions use this exact server-configured origin.
        const webOrigin = @json($web_origin === 'self' ? window.location.origin : $web_origin);
        document.getElementById('print-report')?.addEventListener('click', () => window.print());
        document.getElementById('download-report')?.addEventListener('click', () => {
            window.parent.postMessage({ type: 'caneguard-report-download' }, webOrigin);
        });
        window.addEventListener('message', (event) => {
            if (event.origin !== webOrigin || event.source !== window.parent) return;
            if (event.data && event.data.type === 'caneguard-report-print') window.print();
        });
    })();
</script>
</body>
</html>
