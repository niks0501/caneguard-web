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
    protected $model = Report::class;

    public function definition(): array
    {
        $capturedAt = fake()->dateTimeBetween('-30 days', '-1 hour');

        return [
            'reference_code' => 'CG-'.fake()->unique()->numerify('########'),
            'reporter_id' => User::factory()->fieldReporter(),
            'client_uuid' => fake()->uuid(),
            'barangay' => fake()->randomElement([
                'Mabini',
                'Maligaya',
                'Poblacion',
                'San Isidro',
                'San Roque',
            ]),
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
        ];
    }

    public function configure(): static
    {
        return $this->afterCreating(function (Report $report) {
            $scores = collect(Report::labels())
                ->map(fn (string $label) => [
                    'label' => $label,
                    'score' => $label === $report->predicted_label ? $report->confidence : 0.05,
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
