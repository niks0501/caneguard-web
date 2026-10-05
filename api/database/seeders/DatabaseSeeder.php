<?php

namespace Database\Seeders;

use App\Models\District;
use App\Models\DistrictMembership;
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

        $pilotCode = trim((string) config('caneguard.pilot_district_code'));
        if ($pilotCode === '') {
            throw new LogicException(
                'Set CANEGUARD_PILOT_DISTRICT_CODE before seeding demo users.',
            );
        }

        $seededUsers = [];
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

            $seededUsers[] = $seededUser;
        }

        $pilotDistrict = District::query()->firstOrCreate(
            ['code' => $pilotCode],
            ['name' => $pilotCode],
        );

        foreach ($seededUsers as $seededUser) {
            if ($seededUser->isOfficeUser()) {
                DistrictMembership::query()->firstOrCreate([
                    'user_id' => $seededUser->id,
                    'district_id' => $pilotDistrict->id,
                ]);
            }
        }

        // Advisory catalogs must exist before the dashboard and analytics
        // fixtures select them; AdvisorDemoSeeder also seeds its report examples.
        $this->call([
            OfficeAdvisorySeeder::class,
            ReportSeeder::class,
            AdvisorDemoSeeder::class,
            DashboardReportSeeder::class,
            DemoAnalyticsSeeder::class,
        ]);
    }
}
