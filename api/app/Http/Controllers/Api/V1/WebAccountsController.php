<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\CreateWebAccount;
use App\Actions\Auth\ManageAccounts;
use App\Actions\Auth\ResendWebAccountInvite;
use App\Actions\Auth\UpdateWebAccount;
use App\Http\Controllers\Controller;
use App\Models\SecurityAudit;
use App\Models\User;
use App\Security\AccountsDirectory;
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
        return $user->only(['uuid', 'name', 'email', 'role', 'is_active', 'access_version']);
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
                    'invite_pending' => ! $user->hasVerifiedEmail(),
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
        abort_unless(array_diff(array_keys($request->all()), ['name', 'email', 'role', 'current_password']) === [], 422);
        $request->merge([
            'name' => trim((string) $request->input('name')),
            'email' => Str::lower(trim((string) $request->input('email'))),
        ]);
        $input = $request->validate([
            'name' => ['required', 'string', 'max:255', 'not_regex:/^\s*$/'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            'role' => ['required', Rule::in(CreateWebAccount::ROLES)],
            'current_password' => ['required', 'string', 'max:255'],
        ]);
        $result = $create->handle($request->user(), $input);

        return response()->json(['data' => self::account($result['user']), 'invite_sent' => $result['invite_sent']], 201);
    }

    /** Re-sends the set-password link to a field inspector who has not completed it yet. */
    public function resendInvite(Request $request, string $uuid, ResendWebAccountInvite $resend): JsonResponse
    {
        Gate::authorize('create', User::class);
        $user = User::query()->where('uuid', $uuid)->where('role', User::ROLE_FIELD_REPORTER)->firstOrFail();
        abort_if($user->hasVerifiedEmail() || ! $user->is_active, 409, 'This account has no pending invite.');

        $status = $resend->handle($request->user(), $user);
        abort_if($status === Password::RESET_THROTTLED, 429, 'A link was sent a moment ago. Wait a minute before sending another.');

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
            'actor_name' => $event->actor?->name ?? 'Administrator',
            'created_at' => $event->created_at->toISOString(),
            'before' => $this->snapshot($event->metadata['before'] ?? null),
            'after' => $this->snapshot($event->metadata['after'] ?? null),
        ])]);
    }
}
