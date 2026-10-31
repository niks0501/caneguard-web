<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Weekly RSSI Report · {{ $report['period']['from'] }} to {{ $report['period']['to'] }}</title>
<style>
@page { margin: 18mm 15mm 18mm; }
* { box-sizing: border-box; }
body { font-family: 'DejaVu Sans', sans-serif; font-size: 9pt; line-height: 1.45; color: #1e452a; margin: 0; }
header { border-bottom: 1pt solid #1e452a; padding-bottom: 12pt; margin-bottom: 16pt; }
h1 { font-size: 19pt; line-height: 1.2; margin: 0 0 7pt; font-weight: 700; }
h2 { font-size: 12pt; line-height: 1.3; margin: 14pt 0 7pt; page-break-after: avoid; }
p { margin: 5pt 0 9pt; }
.meta { font-size: 8pt; color: #3f5947; }
.metrics { width: 100%; border-collapse: collapse; margin: 7pt 0 12pt; }
.metrics td { width: 33.333%; padding: 8pt; border: 0.5pt solid #c9d6c5; vertical-align: top; }
.metrics .label { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .06em; color: #3f5947; }
.metrics .value { display: block; font-size: 17pt; font-weight: 700; }
table.cases { width: 100%; border-collapse: collapse; margin: 7pt 0 12pt; font-size: 8pt; }
.cases th { text-align: left; border-bottom: 1pt solid #1e452a; padding: 5pt 4pt; }
.cases td { padding: 5pt 4pt; border-bottom: 0.5pt solid #c9d6c5; vertical-align: top; word-wrap: break-word; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
tr { page-break-inside: avoid; }
.empty { padding: 8pt; border: 0.5pt solid #c9d6c5; }
.suspected { padding: 7pt 9pt; margin: 0 0 8pt; border-left: 3pt solid #7a5320; background: #f8f2e4; }
</style>
</head>
<body>
<header>
<h1>Weekly RSSI Report</h1>
<p>
@if ($report['district'])<strong>{{ $report['district']['name'] }}</strong> ({{ $report['district']['code'] }})<br>@endif
{{ $report['period']['from'] }} to {{ $report['period']['to'] }} · {{ $report['period']['timezone'] }}<br>
<span class="meta">Prepared {{ $report['generated_at'] }} by {{ $report['generated_by'] }}@if ($report['period']['partial']) · the reporting period is still in progress @endif</span>
</p>
</header>

<h2>Summary</h2>
<table class="metrics">
<tr>
<td><span class="label">Validated RSSI cases</span><span class="value">{{ $report['sections']['validated']['cases'] }}</span></td>
<td><span class="label">Suspected RSSI cases, not in the validated total</span><span class="value">{{ $report['sections']['suspected']['cases'] }}</span></td>
<td><span class="label">Reported area of validated cases (ha)</span><span class="value">{{ number_format((float) $report['sections']['validated']['reported_area_hectares'], 2) }}</span></td>
</tr>
</table>
<p class="meta">{{ $report['sections']['validated']['area_method'] }}</p>

<h2>Validated RSSI cases</h2>
<table class="cases">
<thead><tr><th>Case</th><th>Received</th><th>Barangay</th><th>Staff classification</th><th>Verification</th><th class="num">Area (ha)</th></tr></thead>
<tbody>
@forelse ($report['sections']['validated']['rows'] as $row)
<tr><td>{{ $row['case_reference'] }}</td><td>{{ $row['submitted_date'] }}</td><td>{{ $row['barangay'] }}</td><td>{{ $row['staff_classification'] }}</td><td>{{ $row['verification_outcome'] }}</td><td class="num">{{ $row['area_hectares'] === null ? $row['area_measurement'] : number_format((float) $row['area_hectares'], 2) }}</td></tr>
@empty
<tr><td colspan="6" class="empty">No case was reviewed and validated as RSSI in this period.</td></tr>
@endforelse
</tbody>
</table>

<h2>Suspected RSSI cases</h2>
<p class="suspected">These cases are not validated. {{ number_format($report['sections']['suspected']['cases']) }} suspected case(s) are excluded from every validated total above.</p>
<table class="cases">
<thead><tr><th>Case</th><th>Received</th><th>Barangay</th><th>Staff classification</th><th>Verification</th><th class="num">Area (ha)</th></tr></thead>
<tbody>
@forelse ($report['sections']['suspected']['rows'] as $row)
<tr><td>{{ $row['case_reference'] }}</td><td>{{ $row['submitted_date'] }}</td><td>{{ $row['barangay'] }}</td><td>{{ $row['staff_classification'] }}</td><td>{{ $row['verification_outcome'] }}</td><td class="num">{{ $row['area_hectares'] === null ? $row['area_measurement'] : number_format((float) $row['area_hectares'], 2) }}</td></tr>
@empty
<tr><td colspan="6" class="empty">No suspected RSSI case was received in this period.</td></tr>
@endforelse
</tbody>
</table>

<h2>By barangay</h2>
<table class="cases">
<thead><tr><th>Barangay</th><th class="num">Validated</th><th class="num">Suspected, not validated</th></tr></thead>
<tbody>
@forelse ($report['barangays'] as $row)
<tr><td>{{ $row['barangay'] }}</td><td class="num">{{ $row['validated'] }}</td><td class="num">{{ $row['suspected'] }}</td></tr>
@empty
<tr><td colspan="3" class="empty">No RSSI case was received in this period.</td></tr>
@endforelse
</tbody>
</table>

<h2>Method and omissions</h2>
<p class="meta">{{ $report['method']['confirmation'] }}</p>
<p class="meta">{{ $report['method']['boundary'] }}</p>
<p class="meta">{{ $report['method']['privacy'] }}</p>
@foreach ($report['omitted_metrics'] as $omitted)
<p class="meta">{{ $omitted['label'] }}: {{ $omitted['reason'] }}</p>
@endforeach
<p class="meta">Operational case counts, not population statistics.</p>
</body>
</html>
