<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use LogicException;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $users = [
            [
                'name' => 'Field Reporter',
                'email' => 'field@caneguard.test',
                'role' => User::ROLE_FIELD_REPORTER,
                'password' => config('caneguard.demo_users.field_reporter_password'),
            ],
            [
                'name' => 'MAO Reviewer',
                'email' => 'mao@caneguard.test',
                'role' => User::ROLE_REVIEWER,
                'password' => config('caneguard.demo_users.reviewer_password'),
            ],
            [
                'name' => 'CaneGuard Administrator',
                'email' => 'admin@caneguard.test',
                'role' => User::ROLE_ADMIN,
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

        foreach ($users as $user) {
            User::query()->updateOrCreate(
                ['email' => $user['email']],
                $user,
            );
        }

        $this->call(ReportSeeder::class);
    }
}
