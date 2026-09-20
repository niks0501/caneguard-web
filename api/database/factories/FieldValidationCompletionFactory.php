<?php

namespace Database\Factories;

use App\Models\FieldValidationAssignment;
use App\Models\FieldValidationCompletion;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FieldValidationCompletion>
 */
class FieldValidationCompletionFactory extends Factory
{
    protected $model = FieldValidationCompletion::class;

    public function definition(): array
    {
        return [
            'assignment_id' => FieldValidationAssignment::factory(),
            'client_uuid' => fake()->uuid(),
            'field_observation' => 'Fresh observation from the validation visit.',
            'field_finding' => 'The observed symptoms require office review.',
            'action_taken' => 'Provided field guidance and recorded the evidence.',
            'visited_at' => now(),
            'gps_outcome' => 'resolved',
            'gps_attempted_at' => now(),
            'gps_latitude' => 14.0667,
            'gps_longitude' => 120.6319,
            'gps_accuracy' => 4.25,
            'fresh_photo_path' => null,
            'fresh_photo_mime_type' => null,
            'fresh_photo_size_bytes' => null,
        ];
    }
}
