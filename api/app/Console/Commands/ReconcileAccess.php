<?php

namespace App\Console\Commands;

use App\Actions\Auth\ReconcileDistrictAccess;
use App\Models\District;
use App\Models\User;
use App\Security\DistrictAccess;
use Illuminate\Console\Command;

final class ReconcileAccess extends Command
{
    protected $signature = 'caneguard:access {user : Existing user UUID} {district : Existing district code} {reference : Non-secret office approval reference} {--role= : Approved role; otherwise retained} {--grant=* : Complete named grant list} {--revoke : Revoke membership and all district grants}';

    protected $description = 'Apply a documented office access decision to one named account; never certify a roster';

    public function handle(ReconcileDistrictAccess $reconcile, DistrictAccess $access): int
    {
        $target = User::query()->where('uuid', $this->argument('user'))->first();
        $district = District::query()->where('code', $this->argument('district'))->first();
        if ($target === null || $district === null || $district->id !== $access->pilotId()) {
            $this->error('A known identity and the configured pilot district are required.');

            return self::FAILURE;
        }
        try {
            $reconcile->handle($target, $district, $this->option('role') ?: $target->role,
                $this->option('grant'), (bool) $this->option('revoke'), $this->argument('reference'));
        } catch (\InvalidArgumentException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
        $this->info('Documented access applied. Existing credentials were revoked.');

        return self::SUCCESS;
    }
}
