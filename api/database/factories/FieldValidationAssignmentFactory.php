<?php

namespace Database\Factories;

use App\Models\FieldValidationAssignment;
use App\Models\Report;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<FieldValidationAssignment>
 */
class FieldValidationAssignmentFactory extends Factory
{
    protected $model = FieldValidationAssignment::class;

    public function definition(): array
    {
        return [
            'report_id' => Report::factory(),
            'assignee_id' => User::factory()->fieldReporter(),
            'assigned_by_id' => User::factory()->reviewer(),
            'target_visit_date' => fake()->optional()->date('Y-m-d'),
            'activated_at' => now(),
        ];
    }
}
