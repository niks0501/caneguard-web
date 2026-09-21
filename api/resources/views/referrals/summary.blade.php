<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Referral summary - {{ $summary['case']['reference_code'] }}</title>
    <style nonce="{{ request()->attributes->get('csp_nonce') }}">
        :root {
            color-scheme: light;
            font-family: Arial, sans-serif;
            color: #1f3025;
            background: #f3f5f0;
        }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 32px 18px; }
        main {
            width: min(100%, 820px);
            margin: 0 auto;
            padding: 34px;
            background: #fff;
            border: 1px solid #d8e1d7;
            border-radius: 14px;
        }
        header { padding-bottom: 22px; border-bottom: 2px solid #2f633d; }
        h1, h2 { margin: 0; color: #204c2d; }
        h1 { font-size: 28px; }
        h2 { margin-bottom: 14px; font-size: 17px; }
        .eyebrow {
            margin: 0 0 7px;
            color: #6d7d70;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .1em;
            text-transform: uppercase;
        }
        .intro { margin: 10px 0 0; color: #5d6d60; line-height: 1.55; }
        section { padding: 24px 0; border-bottom: 1px solid #e1e8df; }
        section:last-of-type { border-bottom: 0; }
        dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 24px; margin: 0; }
        dt { margin-bottom: 4px; color: #718174; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
        dd { margin: 0; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
        .full { grid-column: 1 / -1; }
        .evidence { display: grid; gap: 12px; }
        .evidence img { display: block; width: min(100%, 560px); max-height: 500px; object-fit: contain; border: 1px solid #d8e1d7; border-radius: 10px; }
        .notice { margin: 0; padding: 12px 14px; color: #5e5426; background: #f7f1d8; border: 1px solid #e5dcad; border-radius: 9px; line-height: 1.45; }
        .muted { color: #718174; }
        .print-actions { display: flex; justify-content: flex-end; margin-bottom: 14px; }
        .model-details { margin-top: 14px; }
        .print-actions button { padding: 9px 13px; color: #fff; background: #2f633d; border: 0; border-radius: 7px; cursor: pointer; }
        @media (max-width: 600px) {
            body { padding: 0; }
            main { padding: 22px 18px; border: 0; border-radius: 0; }
            dl { grid-template-columns: 1fr; }
            .full { grid-column: auto; }
        }
        @media print {
            :root { background: #fff; }
            body { padding: 0; }
            main { width: 100%; padding: 0; border: 0; }
            .print-actions { display: none; }
            section { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <main>
        <div class="print-actions">
            <button type="button" id="print-summary">Print summary</button>
        </div>
        <header>
            <p class="eyebrow">CaneGuard expert referral</p>
            <h1>{{ $summary['case']['reference_code'] }}</h1>
            <p class="intro">This summary contains the case evidence and office context captured for the expert handoff. The possible AI result is decision support only and is not a diagnosis.</p>
        </header>

        <section>
            <h2>Case reference and relevant dates</h2>
            <dl>
                <div><dt>Case reference</dt><dd>{{ $summary['case']['reference_code'] }}</dd></div>
                <div><dt>Referral date</dt><dd>{{ $summary['dates']['referral_date'] }}</dd></div>
                <div><dt>Captured at</dt><dd>{{ $summary['dates']['captured_at'] }}</dd></div>
                <div><dt>Observed at</dt><dd>{{ $summary['dates']['observed_at'] ?: 'Not provided' }}</dd></div>
                <div><dt>Submitted at</dt><dd>{{ $summary['dates']['submitted_at'] }}</dd></div>
                <div><dt>Last office review</dt><dd>{{ $summary['dates']['reviewed_at'] ?: 'Not reviewed' }}</dd></div>
                <div><dt>Consult status</dt><dd>{{ $summary['referral']['status'] ?? $summary['referral']['state'] }}</dd></div>
                <div><dt>Expert response date</dt><dd>{{ $summary['dates']['response_date'] ?: 'Pending' }}</dd></div>
            </dl>
        </section>

        <section>
            <h2>Farmer, farm, and location</h2>
            <dl>
                <div><dt>Farmer or farm reference</dt><dd>{{ $summary['farmer_or_farm_reference'] ?: 'Not provided' }}</dd></div>
                <div><dt>Reporter</dt><dd>{{ $summary['reporter']['name'] }}</dd></div>
                <div><dt>Barangay</dt><dd>{{ $summary['location']['barangay'] }}</dd></div>
                <div><dt>Municipality</dt><dd>{{ $summary['location']['municipality'] ?: 'Not provided' }}</dd></div>
                <div><dt>Province</dt><dd>{{ $summary['location']['province'] ?: 'Not provided' }}</dd></div>
                <div><dt>Coordinates</dt><dd>{{ $summary['location']['latitude'] !== null && $summary['location']['longitude'] !== null ? $summary['location']['latitude'].', '.$summary['location']['longitude'] : 'Not provided' }}</dd></div>
            </dl>
        </section>

        <section>
            <h2>Affected area and portion</h2>
            <dl>
                <div><dt>Affected area (hectares)</dt><dd>{{ $summary['affected']['area_hectares'] !== null ? $summary['affected']['area_hectares'].' ha' : 'Not provided' }}</dd></div>
                <div><dt>Estimated affected portion</dt><dd>{{ $summary['affected']['portion_percent'] !== null ? $summary['affected']['portion_percent'].'%' : 'Not provided' }}</dd></div>
            </dl>
        </section>

        <section>
            <h2>Primary image and evidence</h2>
            <div class="evidence">
                @if ($summary['primary_evidence']['available'])
                    <img src="{{ $summary['primary_evidence']['url'] }}" alt="Primary image evidence for {{ $summary['case']['reference_code'] }}">
                @else
                    <p class="muted">The primary image is not available in the current private evidence store.</p>
                @endif
                <dl>
                    <div><dt>Evidence type</dt><dd>{{ $summary['primary_evidence']['mime_type'] }}</dd></div>
                    <div><dt>Image source</dt><dd>{{ $summary['primary_evidence']['source_type'] }}</dd></div>
                </dl>
            </div>
        </section>

        <section>
            <h2>Reporter observations</h2>
            <dl>
                <div><dt>AI mismatch reported</dt><dd>{{ $summary['reporter_observations']['mismatch_reported'] === null ? 'Not collected' : ($summary['reporter_observations']['mismatch_reported'] ? 'Yes' : 'No') }}</dd></div>
                <div><dt>Reporter suspected condition</dt><dd>{{ $summary['reporter_observations']['suspected_condition'] ?: 'Not provided' }}</dd></div>
                <div class="full"><dt>Observation text</dt><dd>{{ $summary['reporter_observations']['observation_text'] ?: 'Not provided' }}</dd></div>
                <div class="full"><dt>Field notes</dt><dd>{{ $summary['reporter_observations']['field_notes'] ?: 'Not provided' }}</dd></div>
                <div class="full"><dt>Recorded symptom observations</dt><dd>{{ count($summary['reporter_observations']['symptom_keys']) ? implode(', ', $summary['reporter_observations']['symptom_keys']) : 'Not provided' }}</dd></div>
            </dl>
        </section>

        <section>
            <h2>Possible AI result - decision support only</h2>
            <p class="notice">Possible result: {{ $summary['possible_ai_result']['label_text'] }}. Confidence is included as model support context only. This is not a diagnosis or an authority finding.</p>
            <dl class="model-details">
                <div><dt>Model confidence</dt><dd>{{ $summary['possible_ai_result']['confidence'] }}</dd></div>
                <div><dt>Model version</dt><dd>{{ $summary['possible_ai_result']['model_version'] }}</dd></div>
            </dl>
        </section>

        <section>
            <h2>Office context captured at referral</h2>
            <dl>
                <div><dt>Case state</dt><dd>{{ $summary['office_context']['case_state'] }}</dd></div>
                <div><dt>Verification outcome</dt><dd>{{ $summary['office_context']['verification_outcome'] }}</dd></div>
                <div><dt>Field validation state</dt><dd>{{ $summary['office_context']['field_validation_state'] }}</dd></div>
                <div><dt>Action taken</dt><dd>{{ $summary['office_context']['action_taken'] ?: 'Not recorded' }}</dd></div>
                <div><dt>Authority finding</dt><dd>{{ $summary['office_context']['authority_classified_condition'] ?: 'Not classified' }}</dd></div>
                <div><dt>Office reviewer</dt><dd>{{ $summary['office_context']['reviewer']['name'] ?? 'Not recorded' }}</dd></div>
                <div><dt>Context captured at</dt><dd>{{ $summary['office_context']['reviewed_at'] ?: 'Not recorded' }}</dd></div>
                <div class="full"><dt>Office review notes</dt><dd>{{ $summary['office_context']['notes'] ?: 'Not recorded' }}</dd></div>
            </dl>
        </section>

        @if ($summary['advisory'])
            <section>
                <h2>Office advisory</h2>
                <dl>
                    <div><dt>Advisory code</dt><dd>{{ $summary['advisory']['code'] }}</dd></div>
                    <div><dt>Title</dt><dd>{{ $summary['advisory']['title'] }}</dd></div>
                    <div><dt>Status</dt><dd>{{ $summary['advisory']['status'] }}</dd></div>
                    <div><dt>Selected at</dt><dd>{{ $summary['advisory']['selected_at'] ?: 'Not recorded' }}</dd></div>
                    <div><dt>Delivery state</dt><dd>{{ $summary['advisory']['delivery_state'] }}</dd></div>
                    <div><dt>Validated at</dt><dd>{{ $summary['advisory']['validated_at'] ?: 'Not recorded' }}</dd></div>
                    <div class="full"><dt>Guidance</dt><dd>{{ $summary['advisory']['content'] }}</dd></div>
                    <div class="full"><dt>Validation provenance</dt><dd>{{ $summary['advisory']['validation_provenance'] ?: 'Not recorded' }}</dd></div>
                </dl>
            </section>
        @endif

        <section>
            <h2>Referral record</h2>
            <dl>
                <div><dt>Destination</dt><dd>{{ $summary['referral']['destination'] }}</dd></div>
                <div><dt>External reference</dt><dd>{{ $summary['referral']['reference'] }}</dd></div>
                <div><dt>Due date</dt><dd>{{ $summary['referral']['due_date'] ?: 'Not set' }}</dd></div>
                <div><dt>Expert</dt><dd>{{ $summary['referral']['expert_name'] ?: 'Not attributed' }}</dd></div>
                <div class="full"><dt>Expert contact</dt><dd>{{ $summary['referral']['expert_contact'] ?: 'Not provided' }}</dd></div>
                <div class="full"><dt>Referral note</dt><dd>{{ $summary['referral']['note'] ?: 'Not provided' }}</dd></div>
                <div><dt>Response date</dt><dd>{{ $summary['referral']['response_date'] ?: 'Pending' }}</dd></div>
                <div class="full"><dt>Response note</dt><dd>{{ $summary['referral']['response_note'] ?: 'Not provided' }}</dd></div>
                <div class="full"><dt>Finding summary{{ $summary['referral']['finding_source'] === 'transcribed' ? ' (transcribed)' : '' }}</dt><dd>{{ $summary['referral']['finding_summary'] ?: 'Not provided' }}</dd></div>
                <div><dt>Condition opinion</dt><dd>{{ $summary['referral']['condition_opinion'] ?: 'Not provided' }}</dd></div>
                <div><dt>Finding confidence</dt><dd>{{ $summary['referral']['finding_confidence'] ?: 'Not provided' }}</dd></div>
                <div class="full"><dt>Finding details{{ $summary['referral']['finding_source'] === 'transcribed' ? ' (transcribed)' : '' }}</dt><dd>{{ $summary['referral']['finding_details'] ?: 'Not provided' }}</dd></div>
                <div class="full"><dt>Recommendation</dt><dd>{{ $summary['referral']['finding_recommendation'] ?: 'Not provided' }}</dd></div>
                <div><dt>Finding source</dt><dd>{{ $summary['referral']['finding_source'] ?: 'Not recorded' }}</dd></div>
                <div><dt>Office consult decision</dt><dd>{{ $summary['referral']['consult_review_outcome'] ?: 'Not yet recorded' }}</dd></div>
                <div class="full"><dt>Office decision note</dt><dd>{{ $summary['referral']['consult_review_note'] ?: 'Not provided' }}</dd></div>
            </dl>
        </section>
    </main>
    <script nonce="{{ request()->attributes->get('csp_nonce') }}">
        document.getElementById('print-summary')?.addEventListener('click', () => window.print());
    </script>
</body>
</html>
