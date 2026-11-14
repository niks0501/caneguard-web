<?php

namespace Database\Seeders;

use App\Models\District;
use App\Models\DistrictMembership;
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
        $accounts = new DemoAccounts;
        $users = $accounts->validatedUsers();

        $pilotCode = trim((string) config('caneguard.pilot_district_code'));
        if ($pilotCode === '') {
            throw new LogicException(
                'Set CANEGUARD_PILOT_DISTRICT_CODE before seeding demo users.',
            );
        }

        $seededUsers = $accounts->seedUsers($users);

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
