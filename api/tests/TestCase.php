<?php

namespace Tests;

use App\Models\District;
use App\Models\DistrictMembership;
use App\Models\Report;
use App\Models\User;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    private static ?string $testStoragePath = null;

    /** Legacy positive-path suites explicitly opt in; no grants or production backfill. */
    protected function setUpPilotFixtures(): void
    {
        $district = $this->pilotDistrict();
        User::created(function (User $user) use ($district): void {
            DistrictMembership::query()->firstOrCreate(['user_id' => $user->id, 'district_id' => $district->id]);
        });
        Report::creating(function (Report $report) use ($district): void {
            if ($report->district_id === null) {
                $report->district_id = $district->id;
            }
        });
    }

    /** Test-only certification of synthetic seeded fixtures, never invoked by application seeders. */
    protected function approveSeededPilotFixtures(): void
    {
        $district = $this->pilotDistrict();
        User::query()->each(fn (User $user) => DistrictMembership::query()
            ->firstOrCreate(['user_id' => $user->id, 'district_id' => $district->id]));
        Report::query()->whereNull('district_id')->update(['district_id' => $district->id]);
    }

    protected function pilotDistrict(): District
    {
        config(['caneguard.pilot_district_code' => 'test-pilot']);

        return District::query()->firstOrCreate(['code' => 'test-pilot'], ['name' => 'Test pilot district']);
    }

    public function createApplication(): Application
    {
        $storagePath = self::$testStoragePath ??= sprintf(
            '%s/caneguard-web-tests-%s-%d',
            sys_get_temp_dir(),
            function_exists('posix_geteuid') ? posix_geteuid() : get_current_user(),
            getmypid(),
        );

        $_ENV['LARAVEL_STORAGE_PATH'] = $storagePath;
        $_SERVER['LARAVEL_STORAGE_PATH'] = $storagePath;

        $compiledViewPath = $storagePath.'/framework/views';

        if (! is_dir($compiledViewPath)) {
            mkdir($compiledViewPath, 0755, true);
        }

        return parent::createApplication();
    }
}
