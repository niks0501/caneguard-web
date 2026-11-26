<?php

namespace App\Http\Controllers\Api\V1;

use App\Actions\Farmer\StoreFarmerInquiryPhoto;
use App\Http\Controllers\Controller;
use App\Models\FarmerInquiry;
use App\Models\Report;
use App\Models\User;
use App\Support\FarmerInquiryPresenter;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * A farmer's own "ask the office to look" requests. Nothing here writes to
 * `reports`, so a request can never reach the dashboard, map or weekly reports.
 */
class MobileFarmerInquiryController extends Controller
{
    private function farmer(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User && $user->role === User::ROLE_FARMER, 403);

        return $user;
    }

    private function owned(Request $request, string $uuid): FarmerInquiry
    {
        return FarmerInquiry::query()->where('user_id', $this->farmer($request)->id)->where('uuid', $uuid)->firstOrFail();
    }

    private function respond(FarmerInquiry $inquiry, int $status = 200): JsonResponse
    {
        return response()->json(['data' => FarmerInquiryPresenter::farmer($inquiry->load(['photos', 'replies']))], $status);
    }

    public function index(Request $request): JsonResponse
    {
        $farmer = $this->farmer($request);
        $inquiries = FarmerInquiry::query()->where('user_id', $farmer->id)->with(['photos', 'replies'])
            ->orderByDesc('id')->limit(50)->get();

        return response()->json(['data' => $inquiries->map(fn (FarmerInquiry $inquiry) => FarmerInquiryPresenter::farmer($inquiry))->all()]);
    }

    public function show(Request $request, string $inquiry): JsonResponse
    {
        return $this->respond($this->owned($request, $inquiry));
    }

    public function store(Request $request, StoreFarmerInquiryPhoto $photos): JsonResponse
    {
        $farmer = $this->farmer($request);
        $input = $request->validate([
            'client_uuid' => ['required', 'uuid'],
            'scan_chain_uuid' => ['nullable', 'uuid'],
            'barangay' => ['required', 'string', Rule::in(LocationReferenceController::barangayScope())],
            'landmark' => ['nullable', 'string', 'max:120'],
            'concern' => ['nullable', 'string', Rule::in(FarmerInquiry::CONCERNS)],
            'note' => ['nullable', 'string', 'max:500'],
            'ai_label' => ['nullable', 'string', Rule::in([Report::LABEL_HEALTHY, Report::LABEL_MOSAIC, Report::LABEL_RUST, Report::LABEL_SMUT, 'uncertain'])],
            'ai_confidence_percent' => ['nullable', 'integer', 'between:0,100'],
            'photos' => ['required', 'array', 'min:1', 'max:'.FarmerInquiry::MAX_PHOTOS],
            'photos.*' => ['file'],
        ]);

        // A retried upload answers with what the office already holds, before any limit applies.
        $existing = FarmerInquiry::query()->where('user_id', $farmer->id)->where('client_uuid', $input['client_uuid'])->first();
        if ($existing !== null) {
            return $this->respond($existing);
        }

        if (! empty($input['scan_chain_uuid'])) {
            $open = FarmerInquiry::query()->where('user_id', $farmer->id)->where('scan_chain_uuid', $input['scan_chain_uuid'])
                ->where('status', '!=', FarmerInquiry::STATUS_REPLIED)->first();
            if ($open !== null) {
                return response()->json([
                    'message' => 'The office is already looking at this plant.',
                    'code' => 'INQUIRY_ALREADY_OPEN',
                    'inquiry_uuid' => $open->uuid,
                ], 409);
            }
        }

        $waiting = FarmerInquiry::query()->where('user_id', $farmer->id)->where('status', '!=', FarmerInquiry::STATUS_REPLIED)
            ->where('created_at', '>=', now()->subDays(7))->count();
        if ($waiting >= (int) config('caneguard.farmer.inquiry_open_cap')) {
            return response()->json([
                'message' => 'You have several questions waiting for the office. Please wait for their reply first.',
                'code' => 'INQUIRY_LIMIT',
            ], 429);
        }

        $uuid = (string) Str::uuid();
        $stored = [];
        try {
            foreach (array_values($request->file('photos')) as $index => $file) {
                $stored[] = $photos->handle($file, $uuid, $index + 1) + ['position' => $index + 1];
            }
            $inquiry = DB::transaction(function () use ($farmer, $input, $uuid, $stored): FarmerInquiry {
                $inquiry = FarmerInquiry::query()->create([
                    'uuid' => $uuid,
                    'user_id' => $farmer->id,
                    'client_uuid' => $input['client_uuid'],
                    'scan_chain_uuid' => $input['scan_chain_uuid'] ?? null,
                    'barangay' => $input['barangay'],
                    'landmark' => $input['landmark'] ?? null,
                    'concern' => $input['concern'] ?? null,
                    'note' => $input['note'] ?? null,
                    'ai_label' => $input['ai_label'] ?? null,
                    'ai_confidence_percent' => $input['ai_confidence_percent'] ?? null,
                    'status' => FarmerInquiry::STATUS_NEW,
                ]);
                foreach ($stored as $photo) {
                    $inquiry->photos()->create($photo);
                }

                return $inquiry;
            });
        } catch (UniqueConstraintViolationException $exception) {
            $this->discard($stored);
            $existing = FarmerInquiry::query()->where('user_id', $farmer->id)->where('client_uuid', $input['client_uuid'])->first();
            if ($existing !== null) {
                return $this->respond($existing);
            }
            throw $exception;
        } catch (\Throwable $exception) {
            $this->discard($stored);
            throw $exception;
        }

        return $this->respond($inquiry, 201);
    }

    /** Adds the Check Again photo to a request that is still open; a request holds at most two photos. */
    public function addPhoto(Request $request, string $inquiry, StoreFarmerInquiryPhoto $photos): JsonResponse
    {
        $request->validate(['photo' => ['required', 'file']]);
        $stored = null;
        try {
            $result = DB::transaction(function () use ($request, $inquiry, $photos, &$stored) {
                $locked = $this->owned($request, $inquiry);
                $locked = FarmerInquiry::query()->whereKey($locked->id)->lockForUpdate()->firstOrFail();
                if ($locked->status === FarmerInquiry::STATUS_REPLIED) {
                    return response()->json(['message' => 'The office has already replied.', 'code' => 'INQUIRY_CLOSED'], 409);
                }
                $count = $locked->photos()->count();
                if ($count >= FarmerInquiry::MAX_PHOTOS) {
                    return response()->json(['message' => 'This request already has two photos.', 'code' => 'PHOTO_LIMIT'], 409);
                }
                $stored = $photos->handle($request->file('photo'), $locked->uuid, $count + 1) + ['position' => $count + 1];
                $locked->photos()->create($stored);
                $locked->increment('lock_version');

                return $this->respond($locked);
            });
        } catch (\Throwable $exception) {
            $this->discard($stored === null ? [] : [$stored]);
            throw $exception;
        }
        if ($result->getStatusCode() === 409) {
            $this->discard($stored === null ? [] : [$stored]);
        }

        return $result;
    }

    public function photo(Request $request, string $inquiry, int $position): StreamedResponse
    {
        $photo = $this->owned($request, $inquiry)->photos()->where('position', $position)->firstOrFail();
        abort_unless(Storage::disk('local')->exists($photo->path), 404);

        return Storage::disk('local')->response($photo->path, null, [
            'Content-Type' => $photo->mime_type,
            'Cache-Control' => 'private, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** @param  array<int, array{path: string}>  $stored */
    private function discard(array $stored): void
    {
        foreach ($stored as $photo) {
            Storage::disk('local')->delete($photo['path']);
        }
    }
}
