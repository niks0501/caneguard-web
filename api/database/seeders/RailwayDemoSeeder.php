<?php

namespace Database\Seeders;

use App\Models\Advisory;
use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\Report;
use App\Models\User;
use App\Security\DistrictAccess;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use LogicException;

/** Explicitly approved, one-time demo bootstrap. Never called by the normal DatabaseSeeder. */
class RailwayDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (config('caneguard.railway_demo_seed_approval') !== RailwayDemoData::APPROVAL
            || config('caneguard.pilot_district_code') !== 'nasugbu') {
            throw new LogicException('Railway demo seeding requires the exact approved demo marker and nasugbu pilot code.');
        }
        if (mb_strlen(RailwayDemoData::managerName()) < 3 || mb_strlen(RailwayDemoData::managerName()) > 255) {
            throw new LogicException('Set the approved manager display name in runtime configuration before demo bootstrap.');
        }
        foreach (['accounts_enabled', 'self_registration_enabled', 'pilot_roster_certified', 'weekly_send_enabled', 'weekly_appendix_enabled'] as $flag) {
            if (config('caneguard.'.$flag)) {
                throw new LogicException('Demo bootstrap requires accounts, registration, roster, sending and appendix gates closed.');
            }
        }
        if (! in_array(config('mail.default'), ['log', 'array'], true)) {
            throw new LogicException('Demo bootstrap requires a nondelivering mailer.');
        }
        foreach (['field_reporter_password', 'reviewer_password', 'admin_password'] as $key) {
            $password = config('caneguard.demo_users.'.$key);
            if (! is_string($password) || mb_strlen($password) < config('caneguard.auth.password_min_length', 15)) {
                throw new LogicException('Set all three runtime demo passwords to policy-compliant passphrases before demo bootstrap.');
            }
        }

        DB::transaction(function (): void {
            $receipt = DB::table('railway_demo_seed_runs')->where('id', RailwayDemoData::APPROVAL)->lockForUpdate()->first();
            if ($receipt !== null) {
                $this->assertReceipt($receipt);

                return; // Do not reset passwords, edited cases, identities or monthly fixtures on restart.
            }
            if (Report::query()->where('reference_code', 'like', RailwayDemoData::PREFIX.'%')->exists()
                || Advisory::query()->where('code', 'like', RailwayDemoData::PREFIX.'%')->exists()) {
                throw new LogicException('Unreceipted demo namespace collision requires operator review; no existing records will be overwritten.');
            }
            $expectedUsers = [
                'field@caneguard.test' => ['Arnel Mercado', User::ROLE_FIELD_REPORTER],
                'mao@caneguard.test' => ['Liza Mae Navarro', User::ROLE_REVIEWER],
                'admin@caneguard.test' => ['Crisanto de Vera', User::ROLE_ADMIN],
            ];
            foreach ($expectedUsers as $email => [$name, $role]) {
                $user = User::query()->where('email', $email)->first();
                if ($user !== null && ($user->role !== $role
                    || ! in_array($user->name, [$name, $email === 'admin@caneguard.test' ? RailwayDemoData::managerName() : $name], true)
                    || DistrictGrant::query()->where('user_id', $user->id)->exists())) {
                    throw new LogicException('Existing demo identity conflicts with approved membership-only bootstrap; operator review required.');
                }
            }
            DB::table('railway_demo_seed_runs')->insert(['id' => RailwayDemoData::APPROVAL]);
            $previous = config('caneguard.seeders.railway_demo_namespace');
            config(['caneguard.seeders.railway_demo_namespace' => RailwayDemoData::APPROVAL]);
            try {
                // Existing development seeders, isolated references/UUIDs/files.
                $this->call(DatabaseSeeder::class);
                $district = District::query()->where('code', 'nasugbu')->sole();
                $manager = User::query()->where('email', 'admin@caneguard.test')->sole();
                $reportCount = Report::query()->where('reference_code', 'like', RailwayDemoData::PREFIX.'%')->where('district_id', $district->id)->count();
                $receipt = (object) [
                    'district_id' => $district->id, 'manager_id' => $manager->id,
                    'report_count' => $reportCount, 'completed_at' => now(),
                ];
                $this->assertReceipt($receipt);
                DB::table('railway_demo_seed_runs')->where('id', RailwayDemoData::APPROVAL)->update((array) $receipt);
            } finally {
                config(['caneguard.seeders.railway_demo_namespace' => $previous]);
            }
        }, 3);
    }

    private function assertReceipt(object $receipt): void
    {
        $manager = User::query()->find($receipt->manager_id);
        $district = District::query()->find($receipt->district_id);
        $count = Report::query()->where('reference_code', 'like', RailwayDemoData::PREFIX.'%')->where('district_id', $receipt->district_id)->count();
        if ($receipt->completed_at === null || $count < DemoAnalyticsSeeder::REPORT_COUNT || $count !== (int) $receipt->report_count
            || $district?->code !== 'nasugbu' || $manager?->email !== 'admin@caneguard.test'
            || $manager?->name !== RailwayDemoData::managerName() || $manager?->role !== User::ROLE_ADMIN
            || ! app(DistrictAccess::class)->office($manager)
            || DistrictGrant::query()->where('user_id', $manager?->id)->exists()) {
            throw new LogicException('Demo receipt or membership-only bootstrap is incomplete; operator review required, never automatic reseeding.');
        }
    }
}
