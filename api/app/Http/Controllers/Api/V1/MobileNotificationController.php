<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Notifications\CreateLifecycleNotifications;
use App\Http\Controllers\Controller;
use App\Http\Requests\MobileNotificationRequest;
use App\Http\Resources\MobileNotificationResource;
use Carbon\CarbonImmutable;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

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
}
