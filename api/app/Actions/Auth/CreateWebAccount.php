<?php

namespace App\Actions\Auth;

use App\Models\AccountAccessEvent;
use App\Models\District;
use App\Models\DistrictMembership;
use App\Models\SecurityAudit;
use App\Models\User;
use App\Security\AccountsDirectory;
use App\Security\DistrictAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Admin-issued account: unverified until the invitee completes the password-reset flow. */
final class CreateWebAccount
{
    public const ROLES = [User::ROLE_FIELD_REPORTER, User::ROLE_REVIEWER, User::ROLE_ADMIN];

    public const OFFICE_REFERENCE = 'Admin account creation';

    public function __construct(private readonly DistrictAccess $access, private readonly AccountsDirectory $directory) {}

    /** @return array{user: User, invite_sent: bool} */
    public function handle(User $actor, array $input): array
    {
        Gate::forUser($actor)->authorize('create', User::class);
        if (! app(CheckStepUpPassword::class)->handle($actor, $input['current_password'], 'account_created')) {
            throw ValidationException::withMessages(['current_password' => ['The current password is incorrect.']]);
        }
        $districtId = $this->access->pilotId();
        abort_if($districtId === null, 503, 'The pilot district is not configured.');

        $user = DB::transaction(function () use ($actor, $input, $districtId): User {
            $district = District::query()->lockForUpdate()->findOrFail($districtId);
            $manager = User::query()->whereKey($actor->id)->lockForUpdate()->firstOrFail();
            Gate::forUser($manager)->authorize('create', User::class);
            abort_unless($manager->access_version === $actor->access_version
                && Hash::check($input['current_password'], $manager->getAuthPassword()), 403);

            $user = new User(['name' => $input['name'], 'email' => $input['email'], 'role' => $input['role']]);
            // Unusable random secret: the invitee sets the real password through the reset link.
            $user->forceFill(['password' => Str::random(64), 'registration_origin' => 'office_certified', 'email_verified_at' => null])->save();
            if ($user->role === User::ROLE_FIELD_REPORTER) {
                DistrictMembership::query()->firstOrCreate(['user_id' => $user->id, 'district_id' => $district->id]);
            }
            $user->refresh();
            $event = AccountAccessEvent::query()->create([
                'operation_id' => (string) Str::uuid(), 'district_id' => $district->id, 'target_id' => $user->id, 'actor_id' => $manager->id,
                'contract_version' => 'account-access-event-v1', 'action' => 'create', 'office_reference' => self::OFFICE_REFERENCE,
                'actor_snapshot' => ['uuid' => $manager->uuid, 'name' => $manager->name, 'role' => $manager->role],
                'before' => ['role' => null, 'membership_state' => 'not_issued', 'membership_id' => null, 'grants' => [], 'review_state' => 'new'],
                'after' => $this->directory->snapshot($user, lock: true), 'occurred_at' => now()->utc(),
            ]);
            app(RecordSecurityAudit::class)->handle(SecurityAudit::ACTION_ACCOUNT_CREATED, SecurityAudit::OUTCOME_SUCCESS, $manager, $user, [
                'after' => ['role' => $user->role, 'is_active' => $user->is_active],
                'district_id' => $district->id, 'event_id' => $event->id, 'provisioning_channel' => 'web',
            ]);

            return $user;
        }, attempts: 3);

        return ['user' => $user, 'invite_sent' => $this->invite($actor, $user)];
    }

    private function invite(User $actor, User $user): bool
    {
        $sent = false;
        try {
            $sent = Password::broker()->sendResetLink(['email' => $user->email]) === Password::RESET_LINK_SENT;
        } catch (\Throwable $e) {
            Log::warning('Account invitation could not be sent.', ['user' => $user->uuid, 'exception' => $e::class]);
        }
        app(RecordSecurityAudit::class)->handle(
            SecurityAudit::ACTION_ACCOUNT_INVITE,
            $sent ? SecurityAudit::OUTCOME_SUCCESS : SecurityAudit::OUTCOME_FAILURE,
            $actor,
            $user,
        );

        return $sent;
    }
}
