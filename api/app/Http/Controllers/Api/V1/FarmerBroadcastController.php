<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Advisory;
use App\Models\FarmerAdvisoryBroadcast;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Office side of barangay broadcasts: publish validated guidance to farmers,
 * and withdraw it. Reach is counted from home barangay alone.
 */
class FarmerBroadcastController extends Controller
{
    private function authorizeOffice(Request $request): void
    {
        abort_unless($request->user()?->hasWebAccess(), 403);
    }

    /** @return array<string, mixed> */
    private function present(FarmerAdvisoryBroadcast $broadcast): array
    {
        $farmers = User::query()->where('role', User::ROLE_FARMER)->where('is_active', true)->whereNotNull('email_verified_at');
        if ($broadcast->barangays !== null) {
            $farmers->whereIn('barangay', $broadcast->barangays);
        }

        return [
            'uuid' => $broadcast->uuid,
            'advisory' => ['uuid' => $broadcast->advisory->uuid, 'code' => $broadcast->advisory->code, 'title' => $broadcast->advisory->title],
            'headline_tl' => $broadcast->headline_tl,
            'headline_en' => $broadcast->headline_en,
            'body_tl' => $broadcast->body_tl,
            'body_en' => $broadcast->body_en,
            'barangays' => $broadcast->barangays,
            'published_at' => $broadcast->published_at->toISOString(),
            'expires_at' => $broadcast->expires_at->toISOString(),
            'retired_at' => $broadcast->retired_at?->toISOString(),
            'live' => $broadcast->isLive(),
            'reach' => $farmers->count(),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeOffice($request);
        $rows = FarmerAdvisoryBroadcast::query()->with('advisory')->orderByDesc('id')->limit(50)->get();

        return response()->json(['data' => $rows->map(fn (FarmerAdvisoryBroadcast $row) => $this->present($row))->all()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeOffice($request);
        $input = $request->validate([
            'advisory_uuid' => ['required', 'uuid'],
            'headline_tl' => ['required', 'string', 'max:160', 'not_regex:/^\s*$/'],
            'headline_en' => ['required', 'string', 'max:160', 'not_regex:/^\s*$/'],
            'body_tl' => ['required', 'string', 'max:2000', 'not_regex:/^\s*$/'],
            'body_en' => ['required', 'string', 'max:2000', 'not_regex:/^\s*$/'],
            'all_barangays' => ['sometimes', 'boolean'],
            'barangays' => ['sometimes', 'array', 'max:60'],
            'barangays.*' => ['string', 'distinct', Rule::in(LocationReferenceController::barangayScope())],
            'expires_in_days' => ['sometimes', 'integer', 'between:1,'.FarmerAdvisoryBroadcast::MAX_DAYS],
        ]);
        $all = $request->boolean('all_barangays');
        // Reach is always a deliberate choice: every barangay, or a named list.
        abort_if($all === (($input['barangays'] ?? []) !== []), 422, 'Choose all barangays or at least one barangay.');

        $broadcast = DB::transaction(function () use ($request, $input, $all): FarmerAdvisoryBroadcast {
            // Only reviewed guidance is ever broadcast; the lock keeps it from being retired mid-publish.
            $advisory = Advisory::query()->where('uuid', $input['advisory_uuid'])->lockForUpdate()->first();
            abort_if($advisory === null || $advisory->status !== Advisory::STATUS_VALIDATED, 422, 'Only a validated advisory can be broadcast.');

            return FarmerAdvisoryBroadcast::query()->create([
                'advisory_id' => $advisory->id,
                'headline_tl' => trim($input['headline_tl']),
                'headline_en' => trim($input['headline_en']),
                'body_tl' => trim($input['body_tl']),
                'body_en' => trim($input['body_en']),
                'barangays' => $all ? null : array_values($input['barangays']),
                'published_by_id' => $request->user()->id,
                'published_at' => now(),
                'expires_at' => now()->addDays($input['expires_in_days'] ?? FarmerAdvisoryBroadcast::DEFAULT_DAYS),
            ]);
        });

        return response()->json(['data' => $this->present($broadcast->load('advisory'))], 201);
    }

    /** Withdraws a broadcast from farmers' phones. Idempotent. */
    public function retire(Request $request, string $broadcast): JsonResponse
    {
        $this->authorizeOffice($request);
        $row = DB::transaction(function () use ($request, $broadcast): FarmerAdvisoryBroadcast {
            $locked = FarmerAdvisoryBroadcast::query()->where('uuid', $broadcast)->lockForUpdate()->firstOrFail();
            if ($locked->retired_at === null) {
                $locked->forceFill(['retired_at' => now(), 'retired_by_id' => $request->user()->id])->save();
            }

            return $locked;
        });

        return response()->json(['data' => $this->present($row->load('advisory'))]);
    }
}
