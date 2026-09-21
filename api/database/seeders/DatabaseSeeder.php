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
                'email_verified_at' => now(),
                'password' => config('caneguard.demo_users.field_reporter_password'),
            ],
            [
                'name' => 'MAO Reviewer',
                'email' => 'mao@caneguard.test',
                'role' => User::ROLE_REVIEWER,
                'email_verified_at' => now(),
                'password' => config('caneguard.demo_users.reviewer_password'),
            ],
            [
                'name' => 'CaneGuard Administrator',
                'email' => 'admin@caneguard.test',
                'role' => User::ROLE_ADMIN,
                'email_verified_at' => now(),
                'password' => config('caneguard.demo_users.admin_password'),
            ],
        ];

        $expertPassword = config('caneguard.demo_users.expert_password');
        if (is_string($expertPassword) && $expertPassword !== '') {
            $users[] = [
                'name' => 'CaneGuard Expert',
                'email' => 'expert@caneguard.test',
                'role' => User::ROLE_EXPERT,
                'email_verified_at' => now(),
                'password' => $expertPassword,
            ];
        }

        foreach ($users as $user) {
            if (! is_string($user['password']) || $user['password'] === '') {
                throw new LogicException(
                    'Set all CANEGUARD_*_PASSWORD values before seeding demo users.',
                );
            }
        }

        foreach ($users as $user) {
            $attributes = $user;
            unset($attributes['email_verified_at']);

            $seededUser = User::query()->updateOrCreate(
                ['email' => $user['email']],
                $attributes,
            );
            $seededUser->forceFill([
                'email_verified_at' => $user['email_verified_at'],
            ])->save();
        }

        $this->call([
            ReportSeeder::class,
            AdvisorDemoSeeder::class,
        ]);
    }
}
