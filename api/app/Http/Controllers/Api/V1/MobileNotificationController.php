<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Notifications\ScopeNotifications;
use App\Http\Controllers\Controller;
use App\Http\Requests\MobileNotificationMutationRequest;
use App\Http\Requests\MobileNotificationRequest;
use App\Http\Resources\MobileNotificationResource;
use App\Models\Report;
use App\Models\User;
use App\Support\MobileFeedVersion;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\DB;

class MobileNotificationController extends Controller
{
    /** Unread items plus this many days of history are served. */
    public const FEED_WINDOW_DAYS = 60;

    /** Hard ceiling on rows in one feed window, newest first. */
    public const FEED_MAX_ROWS = 500;

    public function __invoke(
        MobileNotificationRequest $request,
    ): AnonymousResourceCollection|JsonResponse {
        $syncBefore = CarbonImmutable::parse(
            $request->validated('sync_before') ?? now(),
        )->utc();
        if ($request->validated('sync_before') === null) {
            // Database timestamps may truncate the instant used for the
            // checkpoint. The ceiling keeps a just-created item in this feed.
            $syncBefore = $syncBefore->addSecond();
        }

        $user = $request->user();
        $window = app(ScopeNotifications::class)->handle($user->notifications(), $user)
            ->where('created_at', '<=', $syncBefore)
            // Anchored to the pinned checkpoint so every page of one sync
            // sees the same window.
            ->where(function ($query) use ($syncBefore): void {
                $query->whereNull('read_at')
                    ->orWhere('created_at', '>=', $syncBefore->subDays(self::FEED_WINDOW_DAYS));
            });

        // The version covers the whole served window, serialized exactly as the
        // phone receives it, so a new, read or aged-out item moves it.
        $total = (clone $window)->count();
        $truncated = $total > self::FEED_MAX_ROWS;
        $stamp = MobileFeedVersion::digest(
            (clone $window)
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->limit(self::FEED_MAX_ROWS)
                ->get()
                ->map(fn ($item): array => (new MobileNotificationResource($item))->resolve($request)),
            ['total' => $total, 'truncated' => $truncated],
        );
        $cursor = $request->validated('cursor');
        if ($cursor !== null && $request->validated('sync_version') !== $stamp['version']) {
            return response()->json([
                'message' => 'The notification window changed during the download. Start the feed again.',
                'code' => 'SYNC_RESTART',
                'sync' => [
                    'before' => $syncBefore->toISOString(),
                    'version' => $stamp['version'],
                    'total' => $total,
                    'truncated' => $truncated,
                    'unchanged' => false,
                ],
            ], 409);
        }

        $unchanged = $cursor === null
            && $request->validated('since') === $stamp['version'];

        $oldest = (clone $window)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->offset(self::FEED_MAX_ROWS - 1)
            ->limit(1)
            ->first(['id', 'created_at']);
        if ($oldest !== null) {
            $window->where(function ($query) use ($oldest): void {
                $query->where('created_at', '>', $oldest->created_at)
                    ->orWhere(function ($tie) use ($oldest): void {
                        $tie->where('created_at', $oldest->created_at)
                            ->where('id', '>=', $oldest->id);
                    });
            });
        }

        if ($unchanged) {
            $window->whereRaw('1 = 0');
        }

        $items = $window
            ->orderBy('created_at')
            ->orderBy('id')
            ->cursorPaginate((int) ($request->validated('per_page') ?? 100))
            ->withQueryString()
            ->appends([
                'sync_before' => $syncBefore->toISOString(),
                'sync_version' => $stamp['version'],
            ]);

        return MobileNotificationResource::collection($items)->additional([
            'sync' => [
                'before' => $syncBefore->toISOString(),
                'version' => $stamp['version'],
                'total' => $total,
                'truncated' => $truncated,
                'unchanged' => $unchanged,
            ],
        ]);
    }

    /**
     * Acknowledge one owner-scoped notification. Loads the item through the
     * authenticated user's notifications relation so another account's
     * notification can never be read or acknowledged.
     */
    public function markRead(
        MobileNotificationMutationRequest $request,
        DatabaseNotification $notification,
    ): MobileNotificationResource {
        $user = $request->user();
        $owned = app(ScopeNotifications::class)->handle($user->notifications(), $user)
            ->whereKey($notification->getKey())
            ->firstOrFail();

        $owned->newQuery()->whereKey($owned->getKey())->whereNull('read_at')->update(['read_at' => now()]);

        $this->acknowledgeAdvice($owned->refresh(), $user);

        return (new MobileNotificationResource($owned->refresh()))->additional([
            'meta' => [
                'unread_count' => app(ScopeNotifications::class)->handle($user->unreadNotifications(), $user)->count(),
            ],
        ]);
    }

    /** Acknowledge every unread notification owned by the signed-in inspector. */
    public function markAllAsRead(
        MobileNotificationMutationRequest $request,
    ): JsonResponse {
        $user = $request->user();
        $markedCount = app(ScopeNotifications::class)->handle($user->unreadNotifications(), $user)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        $notifications = $user->notifications()
            ->where('data->event_type', 'advisory_available')
            ->whereNotNull('read_at')
            ->whereColumn('data->report_uuid', 'reports.uuid')
            ->whereExists(DB::table('advisories')
                ->selectRaw('1')
                ->whereColumn('advisories.id', 'reports.advisory_id')
                ->whereColumn('advisories.uuid', 'notifications.data->advisory_uuid'));

        Report::query()->visibleTo($user)
            ->whereBelongsTo($user, 'reporter')
            ->where('advisory_delivery_state', Report::ADVISORY_DELIVERY_DELIVERED)
            ->whereExists((clone $notifications)->selectRaw('1')->toBase())
            ->update([
                'advisory_delivery_state' => Report::ADVISORY_DELIVERY_ACKNOWLEDGED,
                'advisory_acknowledged_at' => (clone $notifications)->selectRaw('min(notifications.read_at)')->toBase(),
            ]);

        return response()->json([
            'data' => [],
            'meta' => [
                'marked_count' => $markedCount,
                'unread_count' => 0,
            ],
        ]);
    }

    /**
     * Seen event: opening or bulk-reading an owned advisory notification moves
     * that case's still-delivered advice to acknowledged and stamps when. A
     * stale notification for a replaced advisory matches nothing.
     */
    private function acknowledgeAdvice(DatabaseNotification $notification, User $user): void
    {
        $data = is_array($notification->data) ? $notification->data : [];
        if ($notification->read_at === null
            || ($data['event_type'] ?? null) !== 'advisory_available'
            || blank($data['report_uuid'] ?? null)
            || blank($data['advisory_uuid'] ?? null)
        ) {
            return;
        }

        Report::query()->visibleTo($user)
            ->where('uuid', $data['report_uuid'])
            ->whereBelongsTo($user, 'reporter')
            ->whereHas('advisory', fn ($query) => $query->where('uuid', $data['advisory_uuid']))
            ->where('advisory_delivery_state', Report::ADVISORY_DELIVERY_DELIVERED)
            ->update([
                'advisory_delivery_state' => Report::ADVISORY_DELIVERY_ACKNOWLEDGED,
                'advisory_acknowledged_at' => $notification->read_at,
            ]);
    }
}
