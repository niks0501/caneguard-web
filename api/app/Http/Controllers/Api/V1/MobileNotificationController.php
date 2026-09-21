<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Notifications\CreateLifecycleNotifications;
use App\Http\Controllers\Controller;
use App\Http\Requests\MobileNotificationMutationRequest;
use App\Http\Requests\MobileNotificationRequest;
use App\Http\Resources\MobileNotificationResource;
use App\Models\Report;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Notifications\DatabaseNotification;

class MobileNotificationController extends Controller
{
    public function __invoke(
        MobileNotificationRequest $request,
        CreateLifecycleNotifications $notifications,
    ): AnonymousResourceCollection {
        $notifications->ensureFollowUpDueNotifications();
        $syncBefore = CarbonImmutable::parse(
            $request->validated('sync_before') ?? now(),
        )->utc();
        if ($request->validated('sync_before') === null) {
            // Database timestamps may truncate the instant used for the
            // checkpoint. The ceiling keeps a just-created item in this feed.
            $syncBefore = $syncBefore->addSecond();
        }

        $user = $request->user();
        $items = $user->notifications()
            ->where('created_at', '<=', $syncBefore)
            ->orderBy('created_at')
            ->orderBy('id')
            ->cursorPaginate((int) ($request->validated('per_page') ?? 100))
            ->withQueryString()
            ->appends(['sync_before' => $syncBefore->toISOString()]);

        return MobileNotificationResource::collection($items)->additional([
            'sync' => [
                'before' => $syncBefore->toISOString(),
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
        $owned = $user->notifications()
            ->whereKey($notification->getKey())
            ->firstOrFail();

        if ($owned->read_at === null) {
            $owned->markAsRead();
        }

        $data = is_array($owned->data) ? $owned->data : [];
        if (($data['event_type'] ?? null) === 'advisory_available'
            && filled($data['report_uuid'] ?? null)
            && filled($data['advisory_uuid'] ?? null)
        ) {
            Report::query()
                ->where('uuid', $data['report_uuid'])
                ->whereBelongsTo($user, 'reporter')
                ->whereHas('advisory', fn ($query) => $query->where('uuid', $data['advisory_uuid']))
                ->where('advisory_delivery_state', Report::ADVISORY_DELIVERY_DELIVERED)
                ->update([
                    'advisory_delivery_state' => Report::ADVISORY_DELIVERY_ACKNOWLEDGED,
                    'advisory_acknowledged_at' => now()->utc(),
                ]);
        }

        return (new MobileNotificationResource($owned->refresh()))->additional([
            'meta' => [
                'unread_count' => $user->unreadNotifications()->count(),
            ],
        ]);
    }

    /** Acknowledge every unread notification owned by the signed-in inspector. */
    public function markAllAsRead(
        MobileNotificationMutationRequest $request,
    ): JsonResponse {
        $user = $request->user();
        $markedCount = $user->unreadNotifications()->update(['read_at' => now()]);

        return response()->json([
            'data' => [],
            'meta' => [
                'marked_count' => $markedCount,
                'unread_count' => 0,
            ],
        ]);
    }
}
