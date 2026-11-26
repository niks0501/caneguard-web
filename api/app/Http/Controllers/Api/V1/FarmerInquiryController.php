<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Advisory;
use App\Models\FarmerInquiry;
use App\Models\FarmerInquiryReply;
use App\Support\FarmerInquiryPresenter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The office queue for farmer requests. It is separate from the report queue:
 * a request is early-look advice, never a surveillance record.
 */
class FarmerInquiryController extends Controller
{
    private const WITH = ['farmer', 'photos', 'replies.author', 'reviewer'];

    public function index(Request $request): JsonResponse
    {
        Gate::authorize('viewAny', FarmerInquiry::class);
        $input = $request->validate([
            'status' => ['sometimes', 'nullable', 'string', Rule::in([FarmerInquiry::STATUS_NEW, FarmerInquiry::STATUS_REVIEWING, FarmerInquiry::STATUS_REPLIED])],
            'barangay' => ['sometimes', 'nullable', 'string', Rule::in(LocationReferenceController::barangayScope())],
            'page' => ['sometimes', 'integer', 'min:1', 'max:100000'],
        ]);
        $query = FarmerInquiry::query()->with(self::WITH);
        if (! empty($input['status'])) {
            $query->where('status', $input['status']);
        }
        if (! empty($input['barangay'])) {
            $query->where('barangay', $input['barangay']);
        }
        // Waiting requests first, oldest first, so none is buried.
        $page = $query->orderByRaw("case when status = 'replied' then 1 else 0 end")
            ->orderByRaw("case when status = 'replied' then -id else id end")
            ->paginate(25, page: $input['page'] ?? 1);

        return response()->json([
            'data' => $page->getCollection()->map(fn (FarmerInquiry $inquiry) => FarmerInquiryPresenter::office($inquiry))->all(),
            'meta' => ['page' => $page->currentPage(), 'per_page' => $page->perPage(), 'total' => $page->total(),
                'waiting' => FarmerInquiry::query()->where('status', '!=', FarmerInquiry::STATUS_REPLIED)->count()],
        ]);
    }

    public function show(string $inquiry): JsonResponse
    {
        $record = FarmerInquiry::query()->with(self::WITH)->where('uuid', $inquiry)->firstOrFail();
        Gate::authorize('view', $record);

        return response()->json(['data' => FarmerInquiryPresenter::office($record)]);
    }

    /** Marks the request as being looked at, so two reviewers do not answer it twice. */
    public function startReview(Request $request, string $inquiry): JsonResponse
    {
        $input = $request->validate(['expected_lock_version' => ['required', 'integer', 'min:1']]);

        return $this->locked($request, $inquiry, $input['expected_lock_version'], function (FarmerInquiry $locked) use ($request) {
            if ($locked->status === FarmerInquiry::STATUS_NEW) {
                $locked->forceFill(['status' => FarmerInquiry::STATUS_REVIEWING, 'reviewed_by_id' => $request->user()->id, 'reviewed_at' => now()]);
                $locked->lock_version++;
                $locked->save();
            }
        });
    }

    /** Answers with a validated advisory, a plain note, or both. The request is then closed. */
    public function reply(Request $request, string $inquiry): JsonResponse
    {
        $input = $request->validate([
            'expected_lock_version' => ['required', 'integer', 'min:1'],
            'advisory_uuid' => ['nullable', 'uuid'],
            'body' => ['nullable', 'string', 'max:1000'],
        ]);
        $body = trim((string) ($input['body'] ?? ''));
        abort_if($body === '' && empty($input['advisory_uuid']), 422, 'Choose an advisory or write a note.');

        $advisory = null;
        if (! empty($input['advisory_uuid'])) {
            // Only reviewed guidance reaches a farmer: never a draft, never a retired one.
            $advisory = Advisory::query()->where('uuid', $input['advisory_uuid'])->where('status', Advisory::STATUS_VALIDATED)->first();
            abort_if($advisory === null, 422, 'Only a validated advisory can be sent to a farmer.');
        }

        return $this->locked($request, $inquiry, $input['expected_lock_version'], function (FarmerInquiry $locked) use ($request, $advisory, $body) {
            abort_if($locked->status === FarmerInquiry::STATUS_REPLIED, 409, 'This request already has a reply.');
            FarmerInquiryReply::query()->create([
                'farmer_inquiry_id' => $locked->id,
                'author_id' => $request->user()->id,
                'kind' => $advisory !== null ? FarmerInquiryReply::KIND_ADVICE : FarmerInquiryReply::KIND_NOTE,
                'advisory_id' => $advisory?->id,
                'advisory_title' => $advisory?->title,
                'body' => $body !== '' ? $body : (string) $advisory?->content,
            ]);
            $locked->forceFill([
                'status' => FarmerInquiry::STATUS_REPLIED,
                'reviewed_by_id' => $locked->reviewed_by_id ?? $request->user()->id,
                'reviewed_at' => $locked->reviewed_at ?? now(),
                'replied_at' => now(),
            ]);
            $locked->lock_version++;
            $locked->save();
        });
    }

    public function photo(string $inquiry, int $position): StreamedResponse
    {
        $record = FarmerInquiry::query()->where('uuid', $inquiry)->firstOrFail();
        Gate::authorize('view', $record);
        $photo = $record->photos()->where('position', $position)->firstOrFail();
        abort_unless(Storage::disk('local')->exists($photo->path), 404);

        return Storage::disk('local')->response($photo->path, null, [
            'Content-Type' => $photo->mime_type,
            'Cache-Control' => 'private, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** One locked, version-checked write, so a stale or concurrent change answers 409. */
    private function locked(Request $request, string $uuid, int $expectedVersion, \Closure $change): JsonResponse
    {
        $record = DB::transaction(function () use ($request, $uuid, $expectedVersion, $change): FarmerInquiry {
            $locked = FarmerInquiry::query()->where('uuid', $uuid)->lockForUpdate()->firstOrFail();
            Gate::forUser($request->user())->authorize('respond', $locked);
            abort_if($locked->lock_version !== $expectedVersion, 409, 'This request changed. Reload it and try again.');
            $change($locked);

            return $locked;
        });

        return response()->json(['data' => FarmerInquiryPresenter::office($record->load(self::WITH))]);
    }
}
