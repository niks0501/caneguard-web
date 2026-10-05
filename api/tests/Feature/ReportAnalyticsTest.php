<?php

namespace Tests\Feature;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    public function test_analytics_requires_office_authority_and_a_valid_window(): void
    {
        $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-07')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED');

        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create());
        $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-07')
            ->assertForbidden()
            ->assertJsonPath('code', 'FORBIDDEN');

        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());
        $this->getJson('/api/v1/reports/analytics?from=2026-09-07&to=2026-09-01')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-07&granularity=month')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'VALIDATION_ERROR');

        $this->getJson('/api/v1/reports/analytics?from=2025-01-01&to=2026-09-07')
            ->assertUnprocessable()
            ->assertJsonPath('errors.to', ['Custom ranges cannot exceed 366 days.']);

        $this->getJson('/api/v1/reports/analytics?from=2026-01-01&to=2026-09-07&granularity=day')
            ->assertUnprocessable()
            ->assertJsonPath(
                'errors.granularity',
                ['Day buckets are supported for ranges up to 62 days. Use week buckets for longer ranges.'],
            );
    }

    public function test_analytics_buckets_by_pht_day_includes_empty_days_and_excludes_duplicates(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        // 2026-09-01T16:30:00Z is 2026-09-02 in PHT (UTC+8).
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'case_state' => Report::CASE_STATE_OPEN,
            'submitted_at' => CarbonImmutable::parse('2026-09-01T16:30:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_MOSAIC,
            'case_state' => Report::CASE_STATE_CLOSED,
            'submitted_at' => CarbonImmutable::parse('2026-09-02T01:00:00Z'),
        ]);
        $canonical = Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Mabini',
            'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Mabini',
            'canonical_report_id' => $canonical->getKey(),
            'submitted_at' => CarbonImmutable::parse('2026-09-02T03:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $response = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-03',
            'granularity' => 'day',
        ]));

        $response
            ->assertOk()
            ->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.period.from', '2026-09-01')
            ->assertJsonPath('data.period.to', '2026-09-03')
            ->assertJsonPath('data.period.granularity', 'day')
            ->assertJsonPath('data.period.timezone', 'Asia/Manila')
            ->assertJsonPath('data.period.timezone_label', 'PHT (UTC+8)')
            ->assertJsonPath('data.total_submitted', 3)
            ->assertJsonPath('data.series', [
                ['label' => '2026-09-01', 'count' => 0],
                ['label' => '2026-09-02', 'count' => 3],
                ['label' => '2026-09-03', 'count' => 0],
            ])
            ->assertJsonPath('data.case_state', ['open' => 2, 'closed' => 1]);
    }

    public function test_analytics_buckets_by_iso_week_starting_monday(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        // 2026-09-06 is a Sunday; its ISO week starts Monday 2026-08-31.
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'submitted_at' => CarbonImmutable::parse('2026-09-06T02:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'submitted_at' => CarbonImmutable::parse('2026-09-08T02:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-08-31',
            'to' => '2026-09-13',
            'granularity' => 'week',
        ]))
            ->assertOk()
            ->assertJsonPath('data.total_submitted', 2)
            ->assertJsonPath('data.series', [
                ['label' => '2026-08-31', 'count' => 1],
                ['label' => '2026-09-07', 'count' => 1],
            ]);
    }

    public function test_week_comparison_aligns_equal_seven_day_slices_from_each_window_start(): void
    {
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());
        Report::factory()->inDistrict($this->pilotDistrict())->create(['submitted_at' => CarbonImmutable::parse('2026-08-26T02:00:00Z')]);
        Report::factory()->inDistrict($this->pilotDistrict())->create(['submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z')]);
        $data = $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-14&granularity=week')
            ->assertOk()->json('data');
        $this->assertSame(2, count($data['comparison']['current_series']));
        $this->assertSame(['label' => '2026-09-01', 'count' => 1], $data['comparison']['current_series'][0]);
        $this->assertSame(['label' => '2026-08-18', 'count' => 0], $data['comparison']['previous_series'][0]);
        $this->assertSame(['label' => '2026-08-25', 'count' => 1], $data['comparison']['previous_series'][1]);
        $this->assertSame(1, array_sum(array_column($data['comparison']['previous_series'], 'count')));
    }

    public function test_analytics_compares_against_the_previous_equal_window(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'submitted_at' => CarbonImmutable::parse('2026-08-20T02:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]))
            ->assertOk()
            ->assertJsonPath('data.comparison.previous_from', '2026-08-25')
            ->assertJsonPath('data.comparison.previous_to', '2026-08-31')
            ->assertJsonPath('data.comparison.previous_total', 0)
            ->assertJsonPath('data.comparison.current_total', 2)
            ->assertJsonPath('data.comparison.delta', 2)
            ->assertJsonPath('data.comparison.previous_series', array_map(
                static fn (int $offset): array => ['label' => CarbonImmutable::parse('2026-08-25')->addDays($offset)->toDateString(), 'count' => 0],
                range(0, 6),
            ));
    }

    public function test_analytics_applies_the_same_filters_as_the_csv_export(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T02:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Poblacion',
            'predicted_label' => Report::LABEL_RUST,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-09-04T03:00:00Z'),
        ]);

        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Poblacion',
            'predicted_label' => Report::LABEL_RUST,
            'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'submitted_at' => CarbonImmutable::parse('2026-08-28T02:00:00Z'),
        ]);
        Sanctum::actingAs($reviewer);

        $query = http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Mabini',
        ]);

        $this->getJson('/api/v1/reports/analytics?'.$query)
            ->assertOk()
            ->assertJsonPath('data.total_submitted', 1)
            ->assertJsonPath('data.comparison.previous_total', 0)
            ->assertJsonPath('data.cases_by_barangay', [
                ['barangay' => 'Mabini', 'reported_cases' => 1],
            ]);

        $export = $this->get('/api/v1/reports/export?'.http_build_query([
            'status' => Report::STATUS_FOR_FIELD_VALIDATION,
            'predicted_label' => Report::LABEL_RUST,
            'barangay' => 'Mabini',
            'date_from' => '2026-09-01',
            'date_to' => '2026-09-07',
        ]));
        $rows = array_filter(preg_split('/\r\n|\r|\n/', trim($export->streamedContent())) ?: []);
        // Header plus exactly the one matching submitted report.
        $this->assertCount(2, $rows);
    }

    public function test_analytics_returns_an_empty_shape_for_a_quiet_period(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();

        Sanctum::actingAs($reviewer);

        $response = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-02',
            'granularity' => 'day',
        ]));

        $response
            ->assertOk()
            ->assertJsonPath('data.total_submitted', 0)
            ->assertJsonPath('data.series', [
                ['label' => '2026-09-01', 'count' => 0],
                ['label' => '2026-09-02', 'count' => 0],
            ])
            ->assertJsonPath('data.cases_by_barangay', [])
            ->assertJsonPath('data.cases_by_possible_condition', [])
            ->assertJsonPath('data.case_state', ['open' => 0, 'closed' => 0])
            ->assertJsonPath('data.comparison.delta', 0);

        $payload = json_decode($response->getContent(), false, 512, JSON_THROW_ON_ERROR);
        $this->assertIsObject($payload->data->filters);
        $this->assertSame([], (array) $payload->data->filters);
    }

    public function test_analytics_shares_the_monthly_aggregate_for_mid_month_rows(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Mabini',
            'predicted_label' => Report::LABEL_RUST,
            'case_state' => Report::CASE_STATE_CLOSED,
            'submitted_at' => CarbonImmutable::parse('2026-09-15T02:00:00Z'),
        ]);
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'barangay' => 'Rizal',
            'predicted_label' => Report::LABEL_MOSAIC,
            'case_state' => Report::CASE_STATE_OPEN,
            'submitted_at' => CarbonImmutable::parse('2026-09-16T02:00:00Z'),
        ]);

        Sanctum::actingAs($reviewer);

        $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-30',
            'granularity' => 'week',
        ]))->assertOk()->json('data');

        $monthly = $this->getJson('/api/v1/reports/summary?month=2026-09')
            ->assertOk()->json('data');

        // Mid-month rows sit inside both PHT September periods, so the shared
        // aggregate must agree exactly.
        $this->assertSame($monthly['reported_cases'], $analytics['total_submitted']);
        $this->assertSame($monthly['cases_by_barangay'], $analytics['cases_by_barangay']);
        $this->assertSame(
            $monthly['cases_by_possible_condition'],
            $analytics['cases_by_possible_condition'],
        );
        $this->assertSame($monthly['closed_cases'], $analytics['case_state']['closed']);
    }

    public function test_analytics_reports_reported_concern_beside_the_ai_series(): void
    {
        $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
        $rows = [
            ['concern' => Report::REPORTER_CONCERN_RSSI, 'label' => Report::LABEL_MOSAIC],
            ['concern' => Report::LABEL_SMUT, 'label' => Report::LABEL_SMUT],
            ['concern' => 'Red stripe', 'label' => Report::LABEL_HEALTHY],
            ['concern' => null, 'label' => Report::LABEL_RUST],
            ['concern' => ' mosaic ', 'label' => Report::LABEL_MOSAIC],
        ];
        foreach ($rows as $index => $row) {
            Report::factory()->inDistrict($this->pilotDistrict())->create([
                'reporter_suspected_condition' => $row['concern'],
                'predicted_label' => $row['label'],
                'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
                'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z')->addHours($index),
            ]);
        }
        Sanctum::actingAs($reviewer);

        $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
            'from' => '2026-09-01',
            'to' => '2026-09-07',
            'granularity' => 'day',
        ]))->assertOk()->json('data');

        $this->assertSame(5, $analytics['total_submitted']);
        // Declared order, normalised (' mosaic ' folds into mosaic), tail in
        // `other`, blanks in `not_stated`, totals reconciling with the count.
        $this->assertSame(
            [Report::REPORTER_CONCERN_RSSI, Report::LABEL_SMUT, Report::LABEL_MOSAIC, Report::LABEL_RUST, 'other', 'not_stated'],
            array_column($analytics['reported_concern'], 'concern'),
        );
        $this->assertSame([1, 1, 1, 0, 1, 1], array_column($analytics['reported_concern'], 'count'));
        $this->assertSame(5, array_sum(array_column($analytics['reported_concern'], 'count')));
        $this->assertEqualsWithDelta(1.0, array_sum(array_column($analytics['reported_concern'], 'share')), 0.001);

        // Model V1 includes Smut; reporter-only RSSI never enters the AI series.
        $this->assertSame(
            [
                ['condition' => Report::LABEL_HEALTHY, 'count' => 1],
                ['condition' => Report::LABEL_MOSAIC, 'count' => 2],
                ['condition' => Report::LABEL_RUST, 'count' => 1],
                ['condition' => Report::LABEL_SMUT, 'count' => 1],
            ],
            $analytics['possible_condition'],
        );

        $this->assertSame(
            Report::verificationOutcomes(),
            array_keys($analytics['verification_outcome']),
        );
    }

    public function test_review_waiting_age_uses_the_same_period_scoped_population_as_the_review_count(): void
    {
        CarbonImmutable::setTestNow('2026-09-10 09:00:00');
        try {
            $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
            Report::factory()->inDistrict($this->pilotDistrict())->create([
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'submitted_at' => CarbonImmutable::parse('2026-09-08T02:00:00Z'),
            ]);
            Report::factory()->inDistrict($this->pilotDistrict())->create([
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'submitted_at' => CarbonImmutable::parse('2026-08-08T02:00:00Z'),
            ]);
            Report::factory()->inDistrict($this->pilotDistrict())->create([
                'case_state' => Report::CASE_STATE_OPEN,
                'verification_outcome' => Report::VERIFICATION_OUTCOME_NOT_DETERMINED,
                'action_taken' => Report::ACTION_ADVISORY_PROVIDED,
                'submitted_at' => CarbonImmutable::parse('2026-09-08T03:00:00Z'),
            ]);
            Sanctum::actingAs($reviewer);
            $data = $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-10')
                ->assertOk()->json('data');
            $this->assertSame(1, $data['review_backlog']['total_waiting']);
            $this->assertSame(1, array_sum(array_column($data['review_backlog']['buckets'], 'count')));
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_month_to_date_comparison_uses_the_same_dates_in_the_prior_month(): void
    {
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());
        Report::factory()->inDistrict($this->pilotDistrict())->create(['submitted_at' => CarbonImmutable::parse('2026-08-02T02:00:00Z')]);
        Report::factory()->inDistrict($this->pilotDistrict())->create(['submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z')]);
        $data = $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-24&granularity=day&comparison=previous_month')
            ->assertOk()->json('data');
        $this->assertSame('2026-08-01', $data['comparison']['previous_from']);
        $this->assertSame('2026-08-24', $data['comparison']['previous_to']);
        $this->assertSame(1, $data['comparison']['previous_total']);
        $this->assertSame(1, $data['comparison']['current_total']);
        $this->assertSame(['label' => '2026-08-02', 'count' => 1], $data['comparison']['previous_series'][1]);
        $this->assertCount(24, $data['comparison']['previous_series']);
        $this->assertSame($data['comparison']['previous_total'], array_sum(array_column($data['comparison']['previous_series'], 'count')));
        $this->assertCount(24, $data['series']);
    }

    public function test_month_to_date_marks_a_partial_window_and_falls_back_to_equal_length_when_prior_month_is_shorter(): void
    {
        CarbonImmutable::setTestNow('2026-03-31 09:00:00 Asia/Manila');
        try {
            Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());
            $data = $this->getJson('/api/v1/reports/analytics?from=2026-03-01&to=2026-03-31&granularity=day&comparison=previous_month')
                ->assertOk()->json('data');
            $this->assertTrue($data['period']['partial']);
            $this->assertSame(31, $data['period']['days']);
            $this->assertSame('2026-01-29', $data['comparison']['previous_from']);
            $this->assertSame('2026-02-28', $data['comparison']['previous_to']);
            $this->assertCount(31, $data['comparison']['previous_series']);
        } finally {
            CarbonImmutable::setTestNow();
        }
    }

    public function test_possible_condition_includes_supported_smut_but_never_reporter_only_rssi(): void
    {
        Sanctum::actingAs(User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create());
        Report::factory()->inDistrict($this->pilotDistrict())->create([
            'predicted_label' => Report::LABEL_SMUT,
            'reporter_suspected_condition' => Report::REPORTER_CONCERN_RSSI,
            'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z'),
        ]);
        $data = $this->getJson('/api/v1/reports/analytics?from=2026-09-01&to=2026-09-07')
            ->assertOk()->json('data');
        $this->assertContains(['condition' => Report::LABEL_SMUT, 'count' => 1], $data['possible_condition']);
        $this->assertNotContains('rssi', array_column($data['possible_condition'], 'condition'));
        $this->assertSame(1, array_sum(array_column($data['possible_condition'], 'count')));
    }

    public function test_analytics_splits_validation_attention_per_barangay_with_nasugbu_scope(): void
    {
        CarbonImmutable::setTestNow('2026-09-10 09:00:00');
        try {
            $reviewer = User::factory()->inDistrict($this->pilotDistrict())->reviewer()->create();
            $assignee = User::factory()->inDistrict($this->pilotDistrict())->fieldReporter()->create();
            $past = Report::factory()->inDistrict($this->pilotDistrict())->create([
                'barangay' => 'Aga',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'submitted_at' => CarbonImmutable::parse('2026-09-02T02:00:00Z'),
            ]);
            FieldValidationAssignment::factory()->create([
                'report_id' => $past->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-09',
            ]);
            $upcoming = Report::factory()->inDistrict($this->pilotDistrict())->create([
                'barangay' => 'Aga',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_ASSIGNED,
                'submitted_at' => CarbonImmutable::parse('2026-09-03T02:00:00Z'),
            ]);
            FieldValidationAssignment::factory()->create([
                'report_id' => $upcoming->getKey(),
                'assignee_id' => $assignee->getKey(),
                'assigned_by_id' => $reviewer->getKey(),
                'target_visit_date' => '2026-09-12',
            ]);
            Report::factory()->inDistrict($this->pilotDistrict())->create([
                'barangay' => 'Banilad',
                'review_status' => Report::STATUS_FOR_FIELD_VALIDATION,
                'case_state' => Report::CASE_STATE_OPEN,
                'field_validation_state' => Report::FIELD_VALIDATION_STATE_UNASSIGNED,
                'submitted_at' => CarbonImmutable::parse('2026-09-04T02:00:00Z'),
            ]);
            Sanctum::actingAs($reviewer);

            $analytics = $this->getJson('/api/v1/reports/analytics?'.http_build_query([
                'from' => '2026-09-01',
                'to' => '2026-09-30',
                'granularity' => 'week',
            ]))->assertOk()->json('data');

            $byBarangay = [];
            foreach ($analytics['validation_by_barangay'] as $row) {
                $byBarangay[$row['barangay']] = $row;
            }
            $this->assertSame(
                ['barangay' => 'Aga', 'submitted' => 2, 'open' => 2, 'past_target_date' => 1, 'scheduled' => 1, 'unscheduled' => 0],
                $byBarangay['Aga'],
            );
            $this->assertSame(
                ['barangay' => 'Banilad', 'submitted' => 1, 'open' => 1, 'past_target_date' => 0, 'scheduled' => 0, 'unscheduled' => 1],
                $byBarangay['Banilad'],
            );

            // Nasugbu scope proof: every scope barangay present, none omitted.
            $this->assertSame('Nasugbu', $analytics['barangay_scope']['municipality']);
            $this->assertSame('Batangas', $analytics['barangay_scope']['province']);
            foreach (['Aga', 'Banilad', 'Bucana'] as $barangay) {
                $this->assertContains($barangay, $analytics['barangay_scope']['barangays']);
                $this->assertArrayHasKey($barangay, $byBarangay);
            }
            $this->assertSame(0, $byBarangay['Bucana']['submitted']);

            // Segments reconcile with the open count per barangay.
            foreach ($byBarangay as $row) {
                $this->assertSame(
                    $row['open'],
                    $row['past_target_date'] + $row['scheduled'] + $row['unscheduled'],
                    $row['barangay'],
                );
            }
        } finally {
            CarbonImmutable::setTestNow();
        }
    }
}
