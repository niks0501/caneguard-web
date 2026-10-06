<?php

namespace App\Actions\Auth;

use App\Models\AccountAccessEvent;
use App\Models\AccountReview;
use App\Models\District;
use App\Models\DistrictGrant;
use App\Models\User;
use App\Security\AccountsDirectory;
use App\Security\DistrictAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** @deprecated Compatibility action for the v2 account writers. */
final class ManageAccounts
{
    public function __construct(private DistrictAccess $access, private AccountsDirectory $directory, private ReconcileDistrictAccess $reconcile) {}

    public function handle(Request $request, string $kind, ?string $uuid = null): array
    {
        $rules = [
            'contract_version' => ['required', Rule::in(['accounts-access-v1'])],
            'current_password' => ['required', 'string', 'max:255'],
            'office_reference' => ['required', 'string', 'max:160', 'regex:/\S/'],
            'idempotency_key' => ['required', 'uuid'],
        ];
        if ($kind === 'transfer') {
            $rules += ['from_uuid' => ['required', 'uuid'], 'to_uuid' => ['required', 'uuid', 'different:from_uuid'],
                'from_expected_access_version' => ['required', 'integer', 'min:1'], 'to_expected_access_version' => ['required', 'integer', 'min:1']];
        } else {
            $rules['expected_access_version'] = ['required', 'integer', 'min:1'];
            $rules += $kind === 'review' ? ['disposition' => ['required', Rule::in(['keep_farmer', 'defer', 'reopen'])]] : [
                'operation' => ['required', Rule::in(['admit', 'replace', 'revoke', 'restore'])],
                'desired' => ['required', 'array:role,grants'], 'desired.role' => ['required', Rule::in(User::roles())],
                'desired.grants' => ['present', 'array', 'max:3'], 'desired.grants.*' => ['string', Rule::in(DistrictGrant::ABILITIES), 'distinct'],
            ];
        }
        // Do not accept district, verification, wildcard or any undocumented authority field.
        abort_unless(array_diff(array_keys($request->all()), array_keys($rules)) === [], 422);
        $input = $request->validate($rules);
        $actorId = $request->user()->id;
        if (! app(CheckStepUpPassword::class)->handle($request->user(), $input['current_password'], 'district_access_changed')) {
            AccountAccessFailure::reject('STEP_UP_REQUIRED', 'The current password is incorrect.', 422);
        }
        $safeBody = array_diff_key($input, ['current_password' => true]);
        $safeBody['office_reference'] = trim($safeBody['office_reference']);
        if (isset($safeBody['desired'])) {
            sort($safeBody['desired']['grants']);
            ksort($safeBody['desired']);
        }
        ksort($safeBody);
        $hash = hash('sha256', json_encode([$kind, $uuid, $safeBody], JSON_THROW_ON_ERROR));

        $districtId = $this->access->pilotId();

        return DB::transaction(function () use ($input, $kind, $uuid, $actorId, $hash, $districtId): array {
            $district = District::query()->lockForUpdate()->findOrFail($districtId);
            $uuids = $kind === 'transfer' ? [$input['from_uuid'], $input['to_uuid']] : [$uuid];
            $ids = $this->directory->scope()->whereIn('uuid', $uuids)->pluck('id')->all();
            abort_unless(count($ids) === count($uuids), 404);
            $users = User::query()->whereIn('id', array_unique([$actorId, ...$ids]))->orderBy('id')->lockForUpdate()->get();
            $actor = $users->firstWhere('id', $actorId);
            Gate::forUser($actor)->authorize('manageLegacy', $users->firstWhere('id', $ids[0]));
            if (in_array($actorId, $ids, true)) {
                AccountAccessFailure::reject('SELF_CHANGE_FORBIDDEN', 'You cannot change your own authority.', 422);
            }
            if (! Hash::check($input['current_password'], $actor->getAuthPassword())) {
                AccountAccessFailure::reject('STEP_UP_REQUIRED', 'The current password is incorrect.', 422);
            }
            $receiptQuery = DB::table('account_access_receipts')->where('actor_id', $actorId)->where('district_id', $district->id)
                ->where('idempotency_key', $input['idempotency_key']);
            $receipt = $receiptQuery->lockForUpdate()->first();
            if ($receipt !== null) {
                if (! hash_equals($receipt->body_hash, $hash) || now()->greaterThan($receipt->expires_at)) {
                    AccountAccessFailure::reject('IDEMPOTENCY_CONFLICT', 'Refetch before using a new operation key.');
                }

                return json_decode($receipt->response, true, flags: JSON_THROW_ON_ERROR);
            }
            $targets = collect($uuids)->map(fn ($id) => $users->firstWhere('uuid', $id));
            foreach ($targets as $index => $target) {
                $version = $kind === 'transfer' ? $input[$index === 0 ? 'from_expected_access_version' : 'to_expected_access_version'] : $input['expected_access_version'];
                if ($target->access_version !== (int) $version) {
                    AccountAccessFailure::reject('ACCESS_VERSION_CONFLICT', 'Authority changed. Reload and review again.');
                }
            }
            $operationId = (string) Str::uuid();
            $target = $targets->first();
            $event = null;
            if ($kind === 'transfer') {
                [$from, $to] = $targets->all();
                $fromDetail = $this->directory->detail($from, $actor);
                $toDetail = $this->directory->detail($to, $actor);
                if (! in_array('transfer', $toDetail['allowed_actions'], true) || $fromDetail['membership_state'] !== 'active'
                    || $from->role !== User::ROLE_ADMIN || ! in_array('report:approve', $fromDetail['stored_grants'], true) || ! $from->hasVerifiedEmail()) {
                    AccountAccessFailure::reject('INVALID_ACCESS_TRANSITION', 'A transfer requires a current approver and an eligible active officer.', 422);
                }
                $oldKeys = array_values(array_diff($fromDetail['stored_grants'], ['report:approve']));
                $this->reconcile->handle($from, $district, $from->role, $oldKeys, false, $input['office_reference'], $actor, 'transfer_out', $operationId);
                $event = $this->reconcile->handle($to, $district, $to->role, [...$toDetail['stored_grants'], 'report:approve'], false, $input['office_reference'], $actor, 'transfer_in', $operationId);
            } elseif ($kind === 'review') {
                $detail = $this->directory->detail($target, $actor);
                if (! in_array($input['disposition'], $detail['allowed_actions'], true)) {
                    AccountAccessFailure::reject('INVALID_ACCESS_TRANSITION', 'Only eligible unassigned farmers can be triaged.', 422);
                }
                $before = $this->directory->snapshot($target, lock: true);
                $disposition = $input['disposition'] === 'reopen' ? 'new' : $input['disposition'];
                if ($before['review_state'] !== $disposition) {
                    AccountReview::query()->updateOrCreate(['user_id' => $target->id], [
                        'actor_id' => $actorId, 'disposition' => $disposition, 'office_reference' => trim($input['office_reference']),
                    ]);
                    $target->increment('access_version');
                    $event = AccountAccessEvent::query()->create([
                        'operation_id' => $operationId, 'district_id' => $district->id, 'target_id' => $target->id, 'actor_id' => $actorId,
                        'contract_version' => 'account-access-event-v1', 'action' => $input['disposition'],
                        'office_reference' => trim($input['office_reference']), 'actor_snapshot' => ['uuid' => $actor->uuid, 'name' => $actor->name, 'role' => $actor->role],
                        'before' => $before, 'after' => $this->directory->snapshot($target, lock: true), 'occurred_at' => now()->utc(),
                    ]);
                    app(RecordSecurityAudit::class)->handle('account_review_changed', 'success', $actor, $target, ['event_id' => $event->id]);
                }
            } else {
                $detail = $this->directory->detail($target, $actor);
                $operation = $input['operation'];
                $desired = $input['desired'];
                if ($operation !== 'revoke' && ! $target->hasVerifiedEmail()) {
                    AccountAccessFailure::reject('EMAIL_NOT_VERIFIED', 'Email must be verified before staff issuance.', 422);
                }
                if (! in_array($operation, $detail['allowed_actions'], true)
                    || ($operation !== 'revoke' && $desired['role'] === User::ROLE_FARMER)
                    || ($operation === 'revoke' && ($desired['grants'] !== [] || ! in_array($desired['role'], [$target->role, User::ROLE_FARMER], true)))
                    || ($desired['grants'] !== [] && $desired['role'] !== User::ROLE_ADMIN)) {
                    AccountAccessFailure::reject('INVALID_ACCESS_TRANSITION', 'This authority transition is not allowed.', 422);
                }
                $event = $this->reconcile->handle($target, $district, $desired['role'], $desired['grants'], $operation === 'revoke', $input['office_reference'], $actor, $operation, $operationId);
            }
            $response = ['contract_version' => 'accounts-access-v1', 'code' => $kind === 'review' ? 'ACCOUNT_REVIEW_UPDATED' : ($event === null ? 'ACCOUNT_ACCESS_UNCHANGED' : 'ACCOUNT_ACCESS_UPDATED'),
                'data' => $this->directory->detail($this->directory->target($target->uuid), $actor),
                'event_id' => $event?->id, 'operation_id' => $operationId, 'access_version' => $target->fresh()->access_version,
                'credentials_revoked' => $kind !== 'review' && $event !== null];
            if ($kind === 'transfer') {
                $response['affected'] = $targets->map(fn ($u) => $this->directory->detail($this->directory->target($u->uuid), $actor))->all();
            }
            DB::table('account_access_receipts')->insert([
                'actor_id' => $actorId, 'district_id' => $district->id, 'idempotency_key' => $input['idempotency_key'], 'body_hash' => $hash,
                'response' => json_encode($response, JSON_THROW_ON_ERROR), 'expires_at' => now()->addDay(),
            ]);

            return $response;
        }, attempts: 3);
    }
}
