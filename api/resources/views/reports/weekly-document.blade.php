<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CaneGuard Weekly Field Report · {{ $content['period']['week'] }} · Version {{ $version->version }}</title>
<style nonce="{{ request()->attributes->get('csp_nonce') }}">
@page { margin: 18mm 15mm 18mm; }
* { box-sizing: border-box; }
body { font-family: 'DejaVu Sans', sans-serif; font-size: 9pt; line-height: 1.45; color: #1e452a; margin: 0; }
header { border-bottom: 1pt solid #1e452a; padding-bottom: 12pt; margin-bottom: 16pt; }
.logo { width: 60pt; height: 60pt; float: left; }
.letterhead-copy { margin-left: 76pt; }
header:after { content: ''; display: block; clear: both; }
h1 { font-size: 19pt; line-height: 1.2; margin: 0 0 7pt; font-weight: 700; }
h2 { font-size: 12pt; line-height: 1.3; margin: 14pt 0 7pt; page-break-after: avoid; }
h3 { font-size: 10pt; margin: 12pt 0 6pt; page-break-after: avoid; }
p { margin: 5pt 0 9pt; }
.meta { font-size: 8pt; }
table { width: 100%; border-collapse: collapse; margin: 7pt 0 12pt; font-size: 8pt; }
th { text-align: left; border-bottom: 1pt solid #1e452a; padding: 5pt 4pt; }
td { padding: 5pt 4pt; border-bottom: 0.5pt solid #749926; vertical-align: top; word-wrap: break-word; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
tr { page-break-inside: avoid; }
figure { margin: 8pt 0 12pt; page-break-inside: avoid; }
.map-figure img { width: 90%; }
figure img { width: 100%; height: auto; }
figcaption { font-size: 8pt; margin-top: 5pt; }
.visuals { page-break-before: always; }
.signature { margin: 18pt 0; page-break-inside: avoid; }
.notice { font-weight: 700; }
@media screen { body { max-width: 180mm; margin: 24px auto; padding: 20px; } }
</style>
</head>
<body>
<header>
<img class="logo" src="{{ $logo }}" alt="CaneGuard">
<div class="letterhead-copy"><h1>Weekly Field Report</h1>
<p>{{ $content['district']['name'] }} · {{ $content['period']['week'] }}<br>{{ $content['period']['from'] }} to {{ $content['period']['to'] }} · Asia/Manila</p>
<p class="meta">Version {{ $version->version }} · {{ str_replace('_', ' ', $version->version_reason) }} · Content {{ substr($version->content_hash, 0, 12) }}<br>
Prepared by {{ $version->prepared_name }} · {{ $version->created_at?->timezone('Asia/Manila')->format('j F Y g:i A') }} PHT</p>
@if (!$version->approved_at)<p class="notice">DRAFT · Not approved for delivery</p>@endif
@if ($disease)<p class="notice">Derived view: {{ \App\Actions\Reports\BuildWeeklyReportContent::DISEASES[$disease] }}. Weekly totals below remain the full sealed scope; this view is not the approved PDF.</p>@endif
</div></header>
<h2>Weekly summary · full scope</h2>
<table>
<tbody>
<tr><td>Cases, excluding linked duplicates and out-of-scope records</td><td class="num">{{ $content['case_universe']['cases'] }}</td></tr>
<tr><td>Source reports received</td><td class="num">{{ $content['case_universe']['source_reports'] }}</td></tr>
<tr><td>Duplicate-linked reports excluded</td><td class="num">{{ $content['case_universe']['duplicate_linked_excluded'] }}</td></tr>
<tr><td>Out-of-scope records excluded</td><td class="num">{{ $content['case_universe']['out_of_scope_excluded'] }}</td></tr>
<tr><td>Unique named farmer/farm references<br><span class="meta">Name-matched by barangay; approximate, not verified identity</span></td><td class="num">{{ $content['farmers']['named_unique'] }}</td></tr>
<tr><td>Reports carrying farmer/farm information</td><td class="num">{{ $content['farmers']['reports_carrying_farmer_information'] }}</td></tr>
<tr><td>Open / closed cases</td><td class="num">{{ $content['status']['open'] }} / {{ $content['status']['closed'] }}</td></tr>
</tbody></table>
<h2>By class{{ $disease ? ' · selected class' : '' }}</h2>
<table><thead><tr><th>Class</th><th class="num">Suspected</th><th class="num">Under review</th><th class="num">Confirmed</th></tr></thead><tbody>
@foreach ($content['diseases'] as $row)
@if (!$disease || $disease === $row['key'])
<tr><td>{{ $row['label'] }}</td><td class="num">{{ $row['suspected'] }}</td><td class="num">{{ $row['under_review'] }}</td><td class="num">{{ $row['confirmed'] }}</td></tr>
@endif
@endforeach
</tbody></table>
<p class="meta">Unclassified, full scope: mixed or multiple {{ $content['unclassified']['mixed_or_multiple'] }} · unable to classify {{ $content['unclassified']['unable_to_classify'] }} · no classification {{ $content['unclassified']['none'] }}.</p>
<p class="meta">{{ $content['method']['classification'] }}</p>
<h2>By barangay · full scope</h2>
<table><thead><tr><th>Barangay</th><th class="num">Cases</th>@foreach ($content['diseases'] as $row)<th class="num">{{ $row['label'] }} confirmed</th>@endforeach</tr></thead><tbody>
@forelse ($content['barangays'] as $row)
<tr><td>{{ $row['barangay'] }}</td><td class="num">{{ $row['cases'] }}</td>@foreach ($content['diseases'] as $d)<td class="num">{{ $row['confirmed_by_disease'][$d['key']] }}</td>@endforeach</tr>
@empty<tr><td colspan="7">No cases received in this week.</td></tr>@endforelse
</tbody></table>
<h2>Reported area{{ $disease ? ' · selected class' : '' }}</h2>
<table><thead><tr><th>Class</th><th class="num">Farm-group estimate (ha)</th><th class="num">Sum, may overlap (ha)</th></tr></thead><tbody>
@foreach ($content['hectares']['by_disease'] as $row)
@if (!$disease || $disease === $row['key'])
<tr><td>{{ \App\Actions\Reports\BuildWeeklyReportContent::DISEASES[$row['key']] }}</td><td class="num">{{ number_format($row['overlap_controlled_estimate'], 2) }}</td><td class="num">{{ number_format($row['sum_of_reported_areas_may_overlap'], 2) }}</td></tr>
@endif
@endforeach
</tbody></table>
<p class="meta">{{ $content['hectares']['method_statement'] }}</p>
<h2>Recorded actions · full scope</h2>
<table><thead><tr><th>Action</th><th class="num">Cases</th></tr></thead><tbody>
@forelse ($content['actions'] as $row)<tr><td>{{ ucfirst(str_replace('_', ' ', $row['key'])) }}</td><td class="num">{{ $row['count'] }}</td></tr>@empty<tr><td colspan="2">No actions recorded.</td></tr>@endforelse
</tbody></table>
<h2>Late evidence · receipt basis</h2>
<p>{{ $content['late_evidence']['reports_synced_after_period'] }} receipts describe observations before this week.</p>
@foreach ($content['late_evidence']['affected_prior_weeks'] as $row)<p class="meta">{{ $row['week'] }} · {{ $row['count'] }} late receipts</p>@endforeach
@if ($content['late_evidence']['received_later_for_this_week'] ?? 0)<p>{{ $content['late_evidence']['received_later_for_this_week'] }} observations from this week were received in a later week. They are counted only in their receipt week.</p>@endif
<p class="meta">{{ $content['method']['boundary'] }} {{ $content['method']['deduplication'] }}</p>
<div class="signature">
@if ($version->approved_at)
<strong>Approved by {{ $version->approved_name }}</strong><br>{{ $version->approved_title }}<br>{{ $version->approved_at->timezone('Asia/Manila')->format('j F Y g:i A') }} PHT
@else
<p>Approval pending. A named approving officer must review this version before delivery.</p>
@endif
</div>
<section class="visuals">
<h2>Case location reference map · full scope</h2>
<figure class="map-figure"><img src="data:image/svg+xml;base64,{{ base64_encode($map['svg']) }}" alt="Static Nasugbu barangay map with case-count clusters">
<figcaption>Nasugbu barangay reference boundaries, 2011 · James Faeldon, MIT. Approximate 0.01-degree case clusters, not farm boundaries. {{ $content['map']['unlocated_cases'] }} cases without coordinates; {{ $map['outside_reference_extent'] }} outside the reference extent. No area is measured from this map.</figcaption></figure>
@foreach ($charts as $chart)
<figure><h2>{{ $chart['title'] }}</h2><img src="data:image/svg+xml;base64,{{ base64_encode($chart['svg']) }}" alt="{{ $chart['title'] }}; values printed beside each bar"></figure>
@endforeach
</section>
@if (count($content['appendix']))
<section class="visuals"><h2>Restricted appendix · farmer/farm references</h2>
<p class="notice">Office-authorized personal information. Do not distribute separately.</p>
<table><thead><tr><th>Case</th><th>Barangay</th><th>Farmer/farm reference</th><th>Class / state</th></tr></thead><tbody>
@foreach ($content['appendix'] as $row)<tr><td>{{ $row['reference'] }}</td><td>{{ $row['barangay'] }}</td><td>{{ $row['farmer_or_farm_reference'] }}</td><td>{{ $row['disease'] ?? 'Unclassified' }} / {{ str_replace('_', ' ', $row['status']) }}</td></tr>@endforeach
</tbody></table></section>
@endif
</body>
</html>
