<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\CreateWebAccount;
use App\Actions\Auth\UpdateWebAccount;
use App\Http\Controllers\Controller;
use App\Models\SecurityAudit;
use App\Models\User;
use App\Security\AccountsDirectory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/** Supported account API: web roles and global status; field reads carry the read-only access hints only. */
class WebAccountsController extends Controller
{
    public static function account(User $user): array
    {
        return $user->only(['uuid', 'name', 'email', 'role', 'is_active', 'access_version']);
    }

    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', User::class);
        $input = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:160'],
            'page' => ['sometimes', 'integer', 'min:1', 'max:100000'],
        ]);
        $query = User::query()->whereIn('role', User::webRoles());
        if (trim($input['search'] ?? '') !== '') {
            $term = '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], trim($input['search'])).'%';
            $query->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('email', 'like', $term));
        }
        $page = $query->orderBy('name')->orderBy('id')->paginate(25);

        return response()->json([
            'data' => $page->getCollection()->map(fn (User $user) => self::account($user)),
            'meta' => ['page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ]);
    }

    /** Read-only directory of field accounts; changes go through the v2 access operation. */
    public function fieldIndex(Request $request, AccountsDirectory $directory): JsonResponse
    {
        Gate::authorize('viewAny', User::class);
        $input = $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:100000']]);
        $page = $directory->scope()->where('role', User::ROLE_FIELD_REPORTER)->orderBy('name')->orderBy('id')->paginate(25, page: $input['page'] ?? 1);
        $actor = $request->user();

        return response()->json([
            'data' => $page->getCollection()->map(function (User $user) use ($directory, $actor) {
                $detail = $directory->detail($user, $actor);

                return array_merge(self::account($user), [
                    'membership_state' => $detail['membership_state'],
                    'allowed_actions' => $detail['allowed_actions'],
                    'denial_reasons' => $detail['denial_reasons'],
                ]);
            }),
            'meta' => ['page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total()],
        ]);
    }

    public function show(Request $request, string $uuid): JsonResponse
    {
        $user = User::query()->where('uuid', $uuid)->firstOrFail();
        Gate::authorize('view', $user);

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
        Gate::authorize('view', $user);
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
