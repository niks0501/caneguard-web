<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Notifications\CreateLifecycleNotifications;
use App\Actions\Notifications\ScopeNotifications;
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
        CreateLifecycleNotifications $notifications,
    ): AnonymousResourceCollection {
        $notifications->ensureFollowUpDueNotifications();
        $user = $request->user();
        $limit = $request->integer('limit', 20);
        $notifications = app(ScopeNotifications::class)->handle($user->notifications(), $user)
            ->latest()
            ->limit($limit)
            ->get();

        return NotificationResource::collection($notifications)
            ->additional([
                'meta' => [
                    'unread_count' => app(ScopeNotifications::class)->handle($user->unreadNotifications(), $user)->count(),
                    'returned_count' => $notifications->count(),
                ],
            ]);
    }

    public function markRead(
        NotificationMutationRequest $request,
        DatabaseNotification $notification,
    ): NotificationResource {
        $ownedNotification = app(ScopeNotifications::class)->handle($request->user()->notifications(), $request->user())
            ->whereKey($notification->getKey())
            ->firstOrFail();

        $ownedNotification->markAsRead();

        return new NotificationResource($ownedNotification->refresh());
    }

    public function markAllAsRead(
        NotificationMutationRequest $request,
    ): JsonResponse {
        $markedCount = app(ScopeNotifications::class)->handle($request->user()->unreadNotifications(), $request->user())
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
