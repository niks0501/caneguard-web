<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Auth\UpdateWebAccount;
use App\Http\Controllers\Controller;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/** Supported account API: web roles and global status, never district authority. */
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

    public function show(Request $request, string $uuid): JsonResponse
    {
        $user = User::query()->where('uuid', $uuid)->firstOrFail();
        Gate::authorize('view', $user);

        return response()->json(['data' => self::account($user)]);
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
            ->whereIn('action', ['role_change', 'account_status_change', 'web_account_changed', 'district_access_changed', 'account_review_changed', 'district_reporting_settings_changed', 'report_approved', 'report_send_requested'])
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
