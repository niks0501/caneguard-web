<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\FarmerAdvisoryBroadcast;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** What a farmer's phone reads: live guidance for their home barangay, and their own profile choices. */
class MobileFarmerAdvisoryController extends Controller
{
    private function farmer(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User && $user->role === User::ROLE_FARMER, 403);

        return $user;
    }

    public function index(Request $request): JsonResponse
    {
        $farmer = $this->farmer($request);
        $rows = FarmerAdvisoryBroadcast::query()->live()->orderByDesc('published_at')->limit(50)->get()
            ->filter(fn (FarmerAdvisoryBroadcast $row) => $row->reaches($farmer->barangay));

        return response()->json([
            'data' => $rows->values()->map(fn (FarmerAdvisoryBroadcast $row) => [
                'uuid' => $row->uuid,
                'headline_tl' => $row->headline_tl,
                'headline_en' => $row->headline_en,
                'body_tl' => $row->body_tl,
                'body_en' => $row->body_en,
                'published_at' => $row->published_at->toISOString(),
                'expires_at' => $row->expires_at->toISOString(),
            ])->all(),
            'home_barangay' => $farmer->barangay,
        ]);
    }

    /** The farmer's own home barangay and reading language. Their choice, changeable any time. */
    public function profile(Request $request): JsonResponse
    {
        $farmer = $this->farmer($request);
        $input = $request->validate([
            'barangay' => ['sometimes', 'nullable', 'string', Rule::in(LocationReferenceController::barangayScope())],
            'preferred_language' => ['sometimes', 'nullable', 'string', Rule::in(['tl', 'en'])],
        ]);
        abort_unless($request->hasAny(['barangay', 'preferred_language']), 422);
        $farmer->forceFill($input)->save();

        return response()->json(['data' => ['barangay' => $farmer->barangay, 'preferred_language' => $farmer->preferred_language]]);
    }
}
