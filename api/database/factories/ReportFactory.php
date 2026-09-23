<?php

namespace Database\Factories;

use App\Models\Report;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Report>
 */
class ReportFactory extends Factory
{
    /** @var array<int, array{barangay: string, latitude: float, longitude: float}> */
    private const NASUGBU_LOCATIONS = [
        ['barangay' => 'Aga', 'latitude' => 14.0900, 'longitude' => 120.7792],
        ['barangay' => 'Balaytigui', 'latitude' => 14.1260, 'longitude' => 120.6039],
        ['barangay' => 'Banilad', 'latitude' => 14.0730, 'longitude' => 120.7408],
        ['barangay' => 'Bilaran', 'latitude' => 14.0487, 'longitude' => 120.6846],
        ['barangay' => 'Bucana', 'latitude' => 14.0678, 'longitude' => 120.6267],
        ['barangay' => 'Bulihan', 'latitude' => 14.1552, 'longitude' => 120.6540],
        ['barangay' => 'Bunducan', 'latitude' => 14.1069, 'longitude' => 120.6521],
        ['barangay' => 'Butucan', 'latitude' => 14.1394, 'longitude' => 120.6805],
        ['barangay' => 'Calayo', 'latitude' => 14.1461, 'longitude' => 120.6141],
        ['barangay' => 'Catandaan', 'latitude' => 14.0804, 'longitude' => 120.6815],
        ['barangay' => 'Cogunan', 'latitude' => 14.0625, 'longitude' => 120.6555],
        ['barangay' => 'Dayap', 'latitude' => 14.1013, 'longitude' => 120.6627],
    ];

    protected $model = Report::class;

    public function definition(): array
    {
        $capturedAt = fake()->dateTimeBetween('-30 days', '-1 hour');
        $observedAt = fake()->dateTimeBetween($capturedAt, 'now');
        $location = fake()->randomElement(self::NASUGBU_LOCATIONS);

        return [
            'reference_code' => 'CG-'.fake()->unique()->numerify('########'),
            'reporter_id' => User::factory()->fieldReporter(),
            'client_uuid' => fake()->uuid(),
            'scan_record_client_uuid' => fake()->uuid(),
            'barangay' => $location['barangay'],
            'sugarcane_variety' => fake()->optional()->randomElement([
                'PSR 86',
                'Lakatan',
                'Co 86032',
            ]),
            'crop_age' => fake()->optional()->randomElement([
                '3 months',
                '6 months',
                '9 months',
            ]),
            'cane_class' => fake()->optional()->randomElement([
                'Class A',
                'Class B',
                'Class C',
            ]),
            'affected_area_hectares' => fake()->optional()->randomFloat(2, 0.01, 1000),
            'affected_portion_percent' => fake()->optional()->randomFloat(2, 0, 100),
            'field_notes' => fake()->optional()->sentence(),
            'mismatch_reported' => null,
            'reporter_suspected_condition' => null,
            'reporter_observation_text' => null,
            'farmer_or_farm_owner_name' => fake()->name(),
            'province' => 'Batangas',
            'municipality' => 'Nasugbu',
            'final_latitude' => fake()->randomFloat(7, $location['latitude'] - 0.001, $location['latitude'] + 0.001),
            'final_longitude' => fake()->randomFloat(7, $location['longitude'] - 0.001, $location['longitude'] + 0.001),
            'location_source' => 'gps',
            'gps_accuracy' => fake()->randomFloat(2, 0, 50),
            'observed_at' => $observedAt,
            'image_path' => 'reports/'.fake()->uuid().'.jpg',
            'image_mime_type' => 'image/jpeg',
            'image_size_bytes' => fake()->numberBetween(50_000, 4_000_000),
            'image_source_type' => fake()->randomElement(['camera', 'gallery']),
            'source_width' => 1280,
            'source_height' => 960,
            'predicted_label' => fake()->randomElement(Report::labels()),
            'confidence' => fake()->randomFloat(7, 0.5, 0.99),
            'checklist_consistency' => fake()->randomElement([
                'consistent',
                'inconclusive',
                'inconsistent',
            ]),
            'reported_severity' => fake()->randomElement(['low', 'moderate', 'high']),
            'model_version' => 'caneguard-mobile-v1',
            'preprocess_ms' => fake()->randomFloat(3, 1, 30),
            'inference_ms' => fake()->randomFloat(3, 20, 300),
            'total_ms' => fake()->randomFloat(3, 30, 400),
            'captured_at' => $capturedAt,
            'submitted_at' => fake()->dateTimeBetween($capturedAt, 'now'),
            'review_status' => Report::STATUS_SUBMITTED_UNVERIFIED,
            'lock_version' => 0,
            'action_taken' => null,
            'authority_classified_condition' => null,
        ];
    }

    /**
     * Build a report fixture using the Model V1 four-class evidence shape.
     */
    public function mobileModelV1(): static
    {
        return $this->state([
            'predicted_label' => fake()->randomElement(Report::v2Labels()),
            'model_version' => 'v1.0-mobilenetv2',
        ]);
    }

    public function configure(): static
    {
        return $this
            ->afterMaking(function (Report $report): void {
                foreach (Report::lifecycleForReviewStatus($report->review_status) as $attribute => $value) {
                    if ($report->getAttribute($attribute) === null) {
                        $report->setAttribute($attribute, $value);
                    }
                }
            })
            ->afterCreating(function (Report $report): void {
                $labels = $report->model_version === 'v1.0-mobilenetv2'
                    ? Report::v2Labels()
                    : Report::labels();
                $scores = collect($labels)
                    ->map(fn (string $label) => [
                        'label' => $label,
                        'score' => $label === $report->predicted_label
                            ? $report->confidence
                            : 0.05,
                    ])
                    ->all();

                $report->classScores()->createMany($scores);
                $report->symptoms()->create([
                    'symptom_key' => $report->predicted_label === Report::LABEL_HEALTHY
                        ? 'none'
                        : $report->predicted_label,
                ]);
            });
    }
}
