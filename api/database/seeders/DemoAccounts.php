<?php

namespace Database\Seeders;

use App\Models\User;
use LogicException;

final class DemoAccounts
{
    /** @return array<int, array<string, mixed>> */
    public function validatedUsers(): array
    {
        $users = [
            [
                'name' => 'Arnel Mercado',
                'email' => 'field@caneguard.test',
                'role' => User::ROLE_FIELD_REPORTER,
                'email_verified_at' => now(),
                'password' => config('caneguard.demo_users.field_reporter_password'),
            ],
            [
                'name' => 'Liza Mae Navarro',
                'email' => 'mao@caneguard.test',
                'role' => User::ROLE_REVIEWER,
                'email_verified_at' => now(),
                'password' => config('caneguard.demo_users.reviewer_password'),
            ],
            [
                'name' => 'Crisanto de Vera',
                'email' => 'admin@caneguard.test',
                'role' => User::ROLE_ADMIN,
                'email_verified_at' => now(),
                'password' => config('caneguard.demo_users.admin_password'),
            ],
        ];

        foreach ($users as $user) {
            if (! is_string($user['password']) || $user['password'] === '') {
                throw new LogicException(
                    'Set all CANEGUARD_*_PASSWORD values before seeding demo users.',
                );
            }
        }

        return $users;
    }

    /**
     * @param  array<int, array<string, mixed>>  $users
     * @return array<int, User>
     */
    public function seedUsers(array $users): array
    {
        $seededUsers = [];
        foreach ($users as $user) {
            $attributes = $user;
            unset($attributes['email_verified_at']);

            $seededUser = User::query()->updateOrCreate(
                ['email' => $user['email']],
                $attributes,
            );
            // Office-issued demo identities, so the office can admit the field
            // account to the pilot district from Accounts.
            $seededUser->forceFill([
                'email_verified_at' => $user['email_verified_at'],
                'registration_origin' => 'office_certified',
            ])->save();

            $seededUsers[] = $seededUser;
        }

        return $seededUsers;
    }
}
