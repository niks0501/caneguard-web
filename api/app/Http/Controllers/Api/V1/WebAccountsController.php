<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\CreateWebAccount;
use App\Actions\Auth\ManageAccounts;
use App\Actions\Auth\ResendWebAccountInvite;
use App\Actions\Auth\UpdateFarmerAccount;
use App\Actions\Auth\UpdateWebAccount;
use App\Http\Controllers\Controller;
use App\Models\SecurityAudit;
use App\Models\User;
use App\Security\AccountsDirectory;
use App\Support\MailDelivery;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Supported account API: web roles and global status; field reads carry the read-only access hints only. */
class WebAccountsController extends Controller
{
    public static function account(User $user): array
    {
        $account = $user->only(['uuid', 'name', 'email', 'role', 'is_active', 'access_version']);

        return $user->role === User::ROLE_FARMER ? $account + ['barangay' => $user->barangay] : $account;
    }

    /** Farmer directory row: account fields plus onboarding state. */
    public static function farmer(User $user): array
    {
        $invitePending = ! $user->hasVerifiedEmail() && ! $user->hasCompletedOnboarding();

        return self::account($user) + [
            'invite_pending' => $invitePending,
            'email_verified' => $user->hasVerifiedEmail(),
            'status' => ! $user->is_active ? 'disabled' : ($invitePending ? 'invite_pending' : 'active'),
            'created_at' => $user->created_at?->toISOString(),
        ];
    }

    private static function matching(Builder $query, ?string $search): Builder
    {
        if (trim((string) $search) === '') {
            return $query;
        }
        $term = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim($search)).'%';

        return $query->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('email', 'like', $term));
    }

    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', User::class);
        $input = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:160'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:100000'],
        ]);
        $query = self::matching(User::query()->whereIn('role', User::webRoles()), $input['search'] ?? '');
        $page = $query->orderBy('name')->orderBy('id')->paginate(25);

        return response()->json([
            'data' => $page->getCollection()->map(fn (User $user) => self::account($user)),
            'meta' => ['page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ]);
    }

    /** Farmer directory: search, home barangay and status filters. */
    public function farmerIndex(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', User::class);
        $input = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:160'],
            'barangay' => ['sometimes', 'nullable', 'string', Rule::in(LocationReferenceController::barangayScope())],
            'status' => ['sometimes', 'nullable', 'string', Rule::in(['invite_pending', 'active', 'disabled'])],
            'page' => ['sometimes', 'integer', 'min:1', 'max:100000'],
        ]);
        $query = self::matching(User::query()->where('role', User::ROLE_FARMER), $input['search'] ?? '');
        if (! empty($input['barangay'])) {
            $query->where('barangay', $input['barangay']);
        }
        match ($input['status'] ?? null) {
            'disabled' => $query->where('is_active', false),
            'invite_pending' => $query->where('is_active', true)->whereNull('email_verified_at')->whereNull('onboarded_at'),
            'active' => $query->where('is_active', true)->where(fn ($q) => $q->whereNotNull('email_verified_at')->orWhereNotNull('onboarded_at')),
            default => null,
        };
        $page = $query->orderBy('name')->orderBy('id')->paginate(25, page: $input['page'] ?? 1);

        return response()->json([
            'data' => $page->getCollection()->map(fn (User $user) => self::farmer($user)),
            'meta' => ['page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ]);
    }

    /** Disable, re-enable or re-home a farmer: own-password step-up and a version check. */
    public function updateFarmer(Request $request, string $uuid, UpdateFarmerAccount $update): JsonResponse
    {
        $user = User::query()->where('uuid', $uuid)->where('role', User::ROLE_FARMER)->firstOrFail();
        abort_unless(array_diff(array_keys($request->all()), ['is_active', 'barangay', 'current_password', 'expected_access_version']) === [], 422);
        $input = $request->validate([
            'is_active' => ['sometimes', 'boolean'],
            'barangay' => ['sometimes', 'nullable', 'string', Rule::in(LocationReferenceController::barangayScope())],
            'current_password' => ['required', 'string', 'max:255'],
            'expected_access_version' => ['required', 'integer', 'min:1'],
        ]);
        abort_unless($request->hasAny(['is_active', 'barangay']), 422);
        if (isset($input['is_active'])) {
            $input['is_active'] = $request->boolean('is_active');
        }

        return response()->json(['data' => self::farmer($update->handle($request->user(), $user, $input))]);
    }

    /** Read-only directory of field accounts; admit, disable and re-enable go through access(). */
    public function fieldIndex(Request $request, AccountsDirectory $directory): JsonResponse
    {
        Gate::authorize('viewAny', User::class);
        $input = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:160'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:100000'],
        ]);
        $page = self::matching($directory->scope()->where('role', User::ROLE_FIELD_REPORTER), $input['search'] ?? '')->orderBy('name')->orderBy('id')->paginate(25, page: $input['page'] ?? 1);
        $actor = $request->user();

        return response()->json([
            'data' => $page->getCollection()->map(function (User $user) use ($directory, $actor) {
                $detail = $directory->detail($user, $actor);

                return array_merge(self::account($user), [
                    'invite_pending' => ! $user->hasVerifiedEmail() && ! $user->hasCompletedOnboarding(),
                    'email_verified' => $user->hasVerifiedEmail(),
                    'membership_state' => $detail['membership_state'],
                    'allowed_actions' => $detail['allowed_actions'],
                    'denial_reasons' => $detail['denial_reasons'],
                ]);
            }),
            'meta' => ['page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ]);
    }

    /** Field Admit, Disable (revoke) and Re-enable (restore): office reference, own-password step-up, idempotency key and version check. */
    public function access(Request $request, string $uuid, ManageAccounts $accounts): JsonResponse
    {
        $result = $accounts->handle($request, 'access', $uuid, fieldOnly: true);
        $result['data']['is_active'] ??= $request->input('operation') !== 'revoke';
        $result['data'] = array_intersect_key($result['data'], array_flip(['uuid', 'name', 'email', 'role', 'is_active', 'access_version']));

        return response()->json($result);
    }

    public function show(Request $request, string $uuid): JsonResponse
    {
        $user = User::query()->where('uuid', $uuid)->firstOrFail();
        Gate::authorize('inspect', $user);

        return response()->json(['data' => self::account($user)]);
    }

    public function store(Request $request, CreateWebAccount $create): JsonResponse
    {
        Gate::authorize('create', User::class);
        abort_unless(array_diff(array_keys($request->all()), ['name', 'email', 'role', 'barangay', 'current_password']) === [], 422);
        $request->merge([
            'name' => trim((string) $request->input('name')),
            'email' => Str::lower(trim((string) $request->input('email'))),
        ]);
        $input = $request->validate([
            'name' => ['required', 'string', 'max:255', 'not_regex:/^\s*$/'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            'role' => ['required', Rule::in(CreateWebAccount::ROLES)],
            // A home barangay only makes sense for a farmer; it is optional.
            'barangay' => ['sometimes', 'nullable', 'string', Rule::in(LocationReferenceController::barangayScope()), Rule::prohibitedIf($request->input('role') !== User::ROLE_FARMER)],
            'current_password' => ['required', 'string', 'max:255'],
        ]);
        $result = $create->handle($request->user(), $input);

        return response()->json(['data' => self::account($result['user']), 'invite_sent' => $result['invite_sent']], 201);
    }

    /** Re-sends the set-password link to a field inspector or farmer who has not completed it yet. */
    public function resendInvite(Request $request, string $uuid, ResendWebAccountInvite $resend): JsonResponse
    {
        Gate::authorize('create', User::class);
        $user = User::query()->where('uuid', $uuid)->whereIn('role', [User::ROLE_FIELD_REPORTER, User::ROLE_FARMER])->firstOrFail();

        $status = $resend->handle($request->user(), $user);
        abort_if($status === MailDelivery::NOT_PENDING, 409, 'This account has no pending invite.');
        abort_if($status === Password::RESET_THROTTLED, 429, 'A set-password link was issued a moment ago. Wait a minute before sending another.');

        return response()->json(['invite_sent' => $status === Password::RESET_LINK_SENT]);
    }

    public function update(Request $request, string $uuid, UpdateWebAccount $update): JsonResponse
    {
        $user = User::query()->where('uuid', $uuid)->firstOrFail();
        abort_unless(array_diff(array_keys($request->all()), ['role', 'is_active', 'current_password', 'expected_access_version']) === [], 422);
        $input = $request->validate([
            'role' => ['required', Rule::in(User::webRoles())],
            'is_active' => ['required', 'boolean'],
            'current_password' => ['required', 'string', 'max:255'],
            'expected_access_version' => ['required', 'integer', 'min:1'],
        ]);
        $input['is_active'] = $request->boolean('is_active');

        return response()->json(['data' => self::account($update->handle($request->user(), $user, $input))]);
    }

    private function snapshot(?array $snapshot): ?array
    {
        return isset($snapshot['role'], $snapshot['is_active'])
            ? array_intersect_key($snapshot, ['role' => true, 'is_active' => true]) : null;
    }

    public function events(Request $request, string $uuid): JsonResponse
    {
        $user = User::query()->where('uuid', $uuid)->firstOrFail();
        Gate::authorize('inspect', $user);
        $events = SecurityAudit::query()->with('actor')->where('target_user_id', $user->id)
            ->whereIn('action', ['role_change', 'account_status_change', 'web_account_changed', 'district_access_changed', 'account_created', 'account_invite_sent', 'account_review_changed', 'district_reporting_settings_changed', 'report_approved', 'report_send_requested'])
            ->orderByDesc('created_at')->orderByDesc('id')->limit(25)->get();

        return response()->json(['data' => $events->map(fn (SecurityAudit $event) => [
            'id' => $event->id, 'action' => $event->action, 'outcome' => $event->outcome,
            'actor_name' => $event->actor?->name ?? (($event->metadata['provisioning_channel'] ?? null) === 'bootstrap' ? 'Deployment bootstrap' : 'Administrator'),
            'created_at' => $event->created_at->toISOString(),
            'before' => $this->snapshot($event->metadata['before'] ?? null),
            'after' => $this->snapshot($event->metadata['after'] ?? null),
        ])]);
    }
}
