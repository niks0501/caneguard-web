<?php

namespace App\Console\Commands;

use App\Actions\Auth\CertifyStaff;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CertifyRosterStaff extends Command
{
    protected $signature = 'staff:certify-roster {user_uuid} {role} {authority_reference}';

    protected $description = 'Out-of-band certification of an existing verified account against an approved office roster';

    public function handle(CertifyStaff $certify): int
    {
        $actor = User::query()->where('uuid', config('caneguard.access.approver_identity'))->first();
        $target = User::query()->where('uuid', $this->argument('user_uuid'))->first();
        $role = (string) $this->argument('role');
        $reference = trim((string) $this->argument('authority_reference'));

        // This trusted operator-only command also bootstraps the named provisioner.
        // A configured identity is not automatically certified by configuration.
        if (! $actor || ! $actor->hasVerifiedEmail()
            || ! in_array($actor->role, User::officeRoles(), true)
            || ! $target || ! $target->hasVerifiedEmail()
            || ! in_array($target->role, User::roles(), true)
            || ! in_array($role, [User::ROLE_FIELD_REPORTER, ...User::officeRoles()], true)
            || $reference === '' || strlen($reference) > 255) {
            $this->error('Certification denied: configure the provisioner and supply a verified account, supported staff role and approved roster reference.');

            return self::FAILURE;
        }

        DB::transaction(function () use ($actor, $certify, $reference, $role, $target): void {
            $users = User::query()->whereKey([$actor->id, $target->id])
                ->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $actor = $users->get($actor->id);
            $locked = $users->get($target->id);
            abort_unless($actor?->hasVerifiedEmail() && $locked?->hasVerifiedEmail()
                && in_array($actor->role, User::officeRoles(), true)
                && in_array($locked->role, User::roles(), true), 403);
            $certify->handle($locked, $actor, $role, $reference);
        });
        $this->info('Roster certification recorded; previous sessions and tokens revoked.');

        return self::SUCCESS;
    }
}
