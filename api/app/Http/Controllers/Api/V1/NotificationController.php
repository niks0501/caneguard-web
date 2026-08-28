<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListNotificationsRequest;
use App\Http\Requests\NotificationMutationRequest;
use App\Http\Resources\NotificationResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Notifications\DatabaseNotification;

class NotificationController extends Controller
{
    public function index(
        ListNotificationsRequest $request,
    ): AnonymousResourceCollection {
        $user = $request->user();
        $limit = $request->integer('limit', 20);
        $notifications = $user->notifications()
            ->latest()
            ->limit($limit)
            ->get();

        return NotificationResource::collection($notifications)
            ->additional([
                'meta' => [
                    'unread_count' => $user->unreadNotifications()->count(),
                    'returned_count' => $notifications->count(),
                ],
            ]);
    }

    public function markRead(
        NotificationMutationRequest $request,
        DatabaseNotification $notification,
    ): NotificationResource {
        $ownedNotification = $request->user()
            ->notifications()
            ->whereKey($notification->getKey())
            ->firstOrFail();

        $ownedNotification->markAsRead();

        return new NotificationResource($ownedNotification->refresh());
    }

    public function markAllAsRead(
        NotificationMutationRequest $request,
    ): JsonResponse {
        $markedCount = $request->user()
            ->unreadNotifications()
            ->update(['read_at' => now()]);

        return response()->json([
            'data' => [],
            'meta' => [
                'marked_count' => $markedCount,
                'unread_count' => 0,
            ],
        ]);
    }
}
