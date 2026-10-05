<?php

namespace App\Console\Commands;

use App\Security\DistrictAccess;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class BackfillLocalReportDistricts extends Command
{
    protected $signature = 'caneguard:backfill-local-report-districts';

    protected $description = 'Stamp unstamped local demo reports with the configured pilot district';

    public function handle(DistrictAccess $access): int
    {
        // Deliberately opt-in and never part of migrations or normal seeding:
        // assigning legacy reports to a district is unsafe for production data.
        if (! app()->environment('local', 'testing')) {
            $this->error('This backfill is only available in local and testing environments.');

            return self::FAILURE;
        }

        $districtId = $access->pilotId();
        if ($districtId === null) {
            $this->error('Seed the configured pilot district before running this backfill.');

            return self::FAILURE;
        }

        // Use the query builder to preserve timestamps and all report evidence.
        $count = DB::table('reports')->whereNull('district_id')
            ->update(['district_id' => $districtId]);
        $this->info("Stamped {$count} unstamped local reports.");

        return self::SUCCESS;
    }
}
