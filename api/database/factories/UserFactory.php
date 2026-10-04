<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'role' => User::ROLE_FIELD_REPORTER,
            'email_verified_at' => now(),
            // Existing authorization fixtures represent approved staff, not public signup.
            'staff_certified_at' => now(),
            'staff_authority_reference' => 'TEST_ROSTER_APPROVED',
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    public function uncertified(): static
    {
        return $this->state(fn (array $attributes) => [
            'staff_certified_at' => null,
            'staff_authority_reference' => null,
        ]);
    }

    public function farmer(): static
    {
        return $this->uncertified()->state(fn (array $attributes) => [
            'role' => User::ROLE_FARMER,
        ]);
    }

    public function fieldReporter(): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => User::ROLE_FIELD_REPORTER,
        ]);
    }

    public function reviewer(): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => User::ROLE_REVIEWER,
        ]);
    }

    public function admin(): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => User::ROLE_ADMIN,
        ]);
    }
}
