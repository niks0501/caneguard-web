<?php

namespace Database\Factories;

use App\Models\Advisory;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Advisory> */
class AdvisoryFactory extends Factory
{
    protected $model = Advisory::class;

    public function definition(): array
    {
        return [
            'code' => 'ADV-'.fake()->unique()->numerify('######'),
            'title' => fake()->sentence(4),
            'content' => fake()->paragraph(),
            'status' => Advisory::STATUS_DRAFT,
            'validation_provenance' => null,
            'created_by_id' => User::factory()->reviewer(),
            'validated_by_id' => null,
            'validated_at' => null,
            'retired_by_id' => null,
            'retired_at' => null,
        ];
    }

    public function validated(?User $validator = null, ?string $provenance = null): static
    {
        return $this->state([
            'status' => Advisory::STATUS_VALIDATED,
            'validation_provenance' => $provenance ?? 'Validated against the current office guidance register.',
            'validated_by_id' => $validator ?? User::factory()->reviewer(),
            'validated_at' => now()->utc(),
        ]);
    }

    public function retired(?User $retirer = null): static
    {
        return $this->validated()->state([
            'status' => Advisory::STATUS_RETIRED,
            'retired_by_id' => $retirer ?? User::factory()->reviewer(),
            'retired_at' => now()->utc(),
        ]);
    }
}
