<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CaneGuard report · {{ $period['label'] }}</title>
    <style nonce="{{ request()->attributes->get('csp_nonce') }}">
        @font-face { font-family: Poppins; font-style: normal; font-weight: 400; src: url('/fonts/Poppins-Regular.ttf') format('truetype'); font-display: swap; }
        @font-face { font-family: Poppins; font-style: normal; font-weight: 600; src: url('/fonts/Poppins-SemiBold.ttf') format('truetype'); font-display: swap; }
        @font-face { font-family: Poppins; font-style: normal; font-weight: 700; src: url('/fonts/Poppins-Bold.ttf') format('truetype'); font-display: swap; }
        :root { color-scheme: light; --green: #2d6b40; --deep-green: #1e452a; --ink: #1f3025; --muted: #657568; --line: #d8e1d7; --soft: #f3f7f1; --tint: #eaf3e9; --warn: #f7f1d8; --danger: #a34837; font-family: Poppins, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); background: #f4f6f2; }
        * { box-sizing: border-box; }
        @page { size: A4; margin: 18mm 15mm; @bottom-left { content: "CaneGuard · {{ $period['label'] }} · generated {{ $generated_at }}"; color: #657568; font-size: 8pt; } @bottom-right { content: "Page " counter(page) " of " counter(pages); color: #657568; font-size: 8pt; } }
        body { margin: 0; padding: 30px 18px 50px; font-size: 14px; line-height: 1.5; }
        .document { width: min(100%, 980px); margin: 0 auto; padding: 34px; background: #fff; border: 1px solid var(--line); }
        .print-actions { display: flex; gap: 10px; justify-content: flex-end; margin-bottom: 18px; }
        .print-actions button { border: 0; border-radius: 7px; padding: 10px 14px; color: #fff; background: var(--green); font: inherit; font-weight: 600; cursor: pointer; }
        .print-actions button.secondary { color: var(--deep-green); background: var(--tint); }
        .masthead { display: flex; gap: 24px; align-items: flex-start; padding-bottom: 24px; border-bottom: 2px solid var(--green); }
        .lockup { display: flex; align-items: center; gap: 10px; min-width: 190px; color: var(--deep-green); font-size: 18px; font-weight: 700; }
        .lockup img { width: 44px; height: 44px; object-fit: contain; }
        .eyebrow { margin: 0 0 5px; color: var(--green); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
        h1, h2 { margin: 0; color: var(--deep-green); }
        h1 { font-size: 26px; line-height: 1.2; }
        h2 { margin-bottom: 12px; font-size: 16px; }
        h3 { margin: 0 0 6px; color: var(--deep-green); font-size: 13px; }
        .intro { margin: 8px 0 0; color: var(--muted); }
        .meta { margin: 9px 0 0; color: var(--muted); font-size: 11px; }
        .notice { margin: 18px 0 0; padding: 11px 13px; color: #5e5426; background: var(--warn); border: 1px solid #e5dcad; border-radius: 7px; }
        .partial { color: #7c5919; background: #fff7df; border-color: #e5c778; }
        section { padding: 24px 0; border-bottom: 1px solid var(--line); }
        .section-band { margin: -24px 0 18px; padding: 8px 10px; color: var(--deep-green); background: var(--soft); border-left: 4px solid var(--green); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        .metrics { display: table; width: 100%; table-layout: fixed; border-spacing: 10px 0; margin: 0 -10px; }
        .metric { display: table-cell; padding: 14px; background: var(--tint); border: 1px solid #d5e5d3; vertical-align: top; break-inside: avoid; }
        .metric-label { display: block; color: var(--muted); font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
        .metric-value { display: block; margin-top: 4px; color: var(--deep-green); font-size: 24px; font-weight: 700; }
        .metric-unit { color: var(--muted); font-size: 11px; }
        .columns { display: table; width: 100%; table-layout: fixed; border-spacing: 20px 0; margin: 0 -20px; }
        .column { display: table-cell; width: 50%; vertical-align: top; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { padding: 8px 7px; color: var(--muted); background: var(--soft); font-size: 10px; text-align: left; text-transform: uppercase; letter-spacing: .05em; }
        td { padding: 8px 7px; border-bottom: 1px solid #e8eee6; vertical-align: top; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; }
        .bar-chart { display: block; width: 100%; height: 180px; border-bottom: 1px solid var(--line); }
        .bar-chart rect { fill: var(--green); }
        .bar-chart text { fill: var(--muted); font-family: inherit; font-size: 9px; }
        .muted { color: var(--muted); }
        .danger { color: var(--danger); }
        .appendix-warning { margin-bottom: 14px; padding: 10px 12px; color: #714c1a; background: #fff5da; border: 1px solid #e5cf99; }
        .appendix-reference { color: #714c1a; font-size: 10px; font-style: italic; }
        .empty { padding: 20px; color: var(--muted); background: var(--soft); text-align: center; }
        .document-footer { padding-top: 18px; color: var(--muted); font-size: 11px; }
        @media (max-width: 700px) { body { padding: 0; } .document { width: 100%; padding: 22px 18px; border: 0; } .masthead, .columns { display: block; } .lockup { margin-bottom: 18px; } .column { display: block; width: 100%; margin-bottom: 22px; } .metrics { display: block; margin: 0; } .metric { display: block; margin-bottom: 8px; } }
        @media print { :root { background: #fff; } body { padding: 0; font-size: 10pt; } .document { width: 100%; padding: 0; border: 0; } .print-actions { display: none; } .masthead { -webkit-print-color-adjust: exact; print-color-adjust: exact; } section { break-inside: avoid; } .section-band { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .metric { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
</head>
<body>
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

    <section aria-labelledby="key-figures"><div class="section-band" id="key-figures">Key figures</div>
        <div class="metrics">
            <div class="metric"><span class="metric-label">Submitted reports</span><span class="metric-value">{{ number_format($metrics['reported_cases']) }}</span><span class="metric-unit">filtered cases</span></div>
            <div class="metric"><span class="metric-label">Estimated affected area</span><span class="metric-value">{{ number_format($metrics['estimated_affected_hectares'], 2) }}</span><span class="metric-unit">hectares</span></div>
            <div class="metric"><span class="metric-label">Requiring field validation</span><span class="metric-value">{{ number_format($metrics['field_validation_counts']['requiring_validation']) }}</span><span class="metric-unit">assigned or in progress</span></div>
            <div class="metric"><span class="metric-label">Closed cases</span><span class="metric-value">{{ number_format($metrics['closed_cases']) }}</span><span class="metric-unit">in this period</span></div>
        </div>
    </section>

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

    <section aria-labelledby="distribution"><div class="section-band" id="distribution">Distribution</div><div class="columns"><div class="column"><h3>By barangay</h3><table><thead><tr><th>Barangay</th><th>Cases</th></tr></thead><tbody>@forelse ($metrics['cases_by_barangay'] as $row)<tr><td>{{ $row['barangay'] ?: 'Not provided' }}</td><td>{{ $row['reported_cases'] }}</td></tr>@empty<tr><td colspan="2" class="muted">No submitted reports in this period.</td></tr>@endforelse</tbody></table></div><div class="column"><h3>By Possible Condition</h3><table><thead><tr><th>Possible condition</th><th>Cases</th></tr></thead><tbody>@forelse ($metrics['cases_by_possible_condition'] as $row)<tr><td>{{ $row['possible_condition'] ?: 'Not provided' }}</td><td>{{ $row['reported_cases'] }}</td></tr>@empty<tr><td colspan="2" class="muted">No submitted reports in this period.</td></tr>@endforelse</tbody></table></div></div></section>

    <section aria-labelledby="lifecycle"><div class="section-band" id="lifecycle">Case lifecycle</div><div class="columns"><div class="column"><h3>Field validation</h3><table><thead><tr><th>State</th><th>Cases</th></tr></thead><tbody>@foreach ($metrics['field_validation_counts'] as $state => $count)<tr><td>{{ str_replace('_', ' ', ucfirst($state)) }}</td><td>{{ $count }}</td></tr>@endforeach</tbody></table></div><div class="column"><h3>Review time</h3><table><tbody><tr><td>Reviewed cases</td><td>{{ $metrics['review_time']['reviewed_cases'] }}</td></tr><tr><td>Average</td><td>{{ $metrics['review_time']['average_hours'] !== null ? $metrics['review_time']['average_hours'].' hours' : 'Not available' }}</td></tr><tr><td>Median</td><td>{{ $metrics['review_time']['median_hours'] !== null ? $metrics['review_time']['median_hours'].' hours' : 'Not available' }}</td></tr></tbody></table></div></div></section>

    <section aria-labelledby="expert"><div class="section-band" id="expert">Expert verification</div><table><tbody><tr><td>Consult volume</td><td>{{ $metrics['expert_verification']['consult_volume']['total'] }}</td></tr><tr><td>Expert agreement</td><td>{{ $metrics['expert_verification']['expert_agreement']['percentage'] !== null ? $metrics['expert_verification']['expert_agreement']['percentage'].'%' : 'Not available' }}</td></tr><tr><td>Unable-to-classify rate</td><td>{{ $metrics['expert_verification']['unable_to_classify_rate']['percentage'] !== null ? $metrics['expert_verification']['unable_to_classify_rate']['percentage'].'%' : 'Not available' }}</td></tr><tr><td>Advisory coverage</td><td>{{ $metrics['expert_verification']['advisory_coverage']['coverage_rate'] !== null ? ($metrics['expert_verification']['advisory_coverage']['coverage_rate'] * 100).'%' : 'Not available' }}</td></tr></tbody></table></section>

    <section aria-labelledby="queues"><div class="section-band" id="queues">Operational queues</div><table><thead><tr><th>Queue</th><th>Cases</th></tr></thead><tbody>@foreach ($operational_queues as $queue => $count)<tr><td>{{ str_replace('_', ' ', ucfirst($queue)) }}</td><td class="{{ in_array($queue, ['follow_up_due', 'needs_visit'], true) && $count ? 'danger' : '' }}">{{ $count }}</td></tr>@endforeach</tbody></table></section>

    @if ($appendix_enabled)
    <section aria-labelledby="appendix"><div class="section-band" id="appendix">Case register appendix</div><div class="appendix-warning">{{ $appendix_warning }}</div><p class="appendix-reference">Farmer or farm reference — included because appendix was explicitly enabled.</p>@if ($appendix_capped)<p class="muted">This appendix is capped at 1,000 rows; continuation is not included.</p>@endif<table><thead><tr><th>Case</th><th>Submitted</th><th>Barangay</th><th>Farmer or farm reference</th><th>Possible condition</th><th>Status</th></tr></thead><tbody>@forelse ($appendix as $row)<tr><td>{{ $row['case_reference'] }}</td><td>{{ $row['submitted_date'] }}</td><td>{{ $row['barangay'] }}</td><td>{{ $row['farmer_or_farm_reference'] ?: 'Not provided' }}</td><td>{{ $row['possible_ai_condition'] }}</td><td>{{ $row['work_status'] }}</td></tr>@empty<tr><td colspan="6" class="muted">No submitted reports in this period.</td></tr>@endforelse</tbody></table></section>
    @endif
    <footer class="document-footer">CaneGuard · {{ $period['label'] }} · {{ $period['timezone_label'] }} · Generated {{ $generated_at }} · Page numbers appear in the print footer.</footer>
</main>
<script nonce="{{ request()->attributes->get('csp_nonce') }}">
    document.getElementById('print-report')?.addEventListener('click', () => window.print());
    document.getElementById('download-report')?.addEventListener('click', () => { window.parent.postMessage({ type: 'caneguard-report-download' }, window.location.origin); });
</script>
</body>
</html>
