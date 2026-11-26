<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\AdvisoryRequest;
use App\Http\Requests\AdvisoryTransitionRequest;
use App\Http\Resources\AdvisoryResource;
use App\Models\Advisory;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;

class AdvisoryController extends Controller
{
    public const DELETED_HARD = 'hard';

    public const DELETED_ARCHIVED = 'archived';

    public function index(): AnonymousResourceCollection
    {
        abort_unless(request()->user()?->isOfficeUser(), 403);

        return AdvisoryResource::collection(
            Advisory::query()
                ->with(['validatedBy', 'retiredBy'])
                ->orderByRaw("CASE status WHEN 'validated' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END")
                ->orderBy('code')
                ->get(),
        );
    }

    /** Creates an advisory that is immediately usable: the office pool is co-managed, so there is no draft step. */
    public function store(AdvisoryRequest $request): AdvisoryResource
    {
        $advisory = $this->createWithGeneratedCode($request->validated(), $request->user());

        return new AdvisoryResource($advisory->load(['validatedBy', 'retiredBy']));
    }

    public function show(Advisory $advisory): AdvisoryResource
    {
        abort_unless(request()->user()?->isOfficeUser(), 403);

        return new AdvisoryResource($advisory->load(['validatedBy', 'retiredBy']));
    }

    /**
     * Edits in place for draft and validated advisories. Past cases keep the
     * wording they were sent (snapshotted on the report), so this never
     * rewrites history. Retired and archived advisories stay frozen.
     */
    public function update(AdvisoryRequest $request, Advisory $advisory): AdvisoryResource
    {
        $data = $request->validated();
        $updated = DB::transaction(function () use ($advisory, $data): Advisory {
            $locked = Advisory::query()
                ->withTrashed()
                ->lockForUpdate()
                ->findOrFail($advisory->getKey());
            if ($locked->trashed()) {
                throw ValidationException::withMessages([
                    'status' => 'This advisory was removed from the office library and can no longer be edited.',
                ]);
            }
            if ($locked->status === Advisory::STATUS_RETIRED) {
                throw ValidationException::withMessages([
                    'status' => 'Retired advisories can no longer be edited.',
                ]);
            }
            $locked->update(collect($data)->only(['code', 'title', 'content', 'category'])->all());

            return $locked;
        });

        return new AdvisoryResource($updated->load(['validatedBy', 'retiredBy']));
    }

    /**
     * Removes an advisory from the library. One nobody has used is deleted for
     * good; one a report, farmer reply or broadcast points at is archived
     * (soft-deleted) so that history and the broadcast foreign key stay intact.
     */
    public function destroy(Request $request, Advisory $advisory): JsonResponse
    {
        abort_unless($request->user()?->isOfficeUser(), 403);

        $outcome = DB::transaction(function () use ($advisory): string {
            $locked = Advisory::query()
                ->withTrashed()
                ->lockForUpdate()
                ->findOrFail($advisory->getKey());
            if ($locked->trashed()) {
                return self::DELETED_ARCHIVED;
            }

            $referenced = DB::table('reports')->where('advisory_id', $locked->getKey())->exists()
                || DB::table('farmer_inquiry_replies')->where('advisory_id', $locked->getKey())->exists()
                || DB::table('farmer_advisory_broadcasts')->where('advisory_id', $locked->getKey())->exists();
            if ($referenced) {
                $locked->delete();

                return self::DELETED_ARCHIVED;
            }

            $locked->forceDelete();

            return self::DELETED_HARD;
        });

        return response()->json(['data' => ['uuid' => $advisory->uuid, 'deleted' => $outcome]]);
    }

    public function validate(
        AdvisoryTransitionRequest $request,
        Advisory $advisory,
    ): AdvisoryResource {
        return $this->transition($request, $advisory, Advisory::STATUS_VALIDATED);
    }

    public function retire(
        AdvisoryTransitionRequest $request,
        Advisory $advisory,
    ): AdvisoryResource {
        return $this->transition($request, $advisory, Advisory::STATUS_RETIRED);
    }

    public function transition(
        AdvisoryTransitionRequest $request,
        Advisory $advisory,
        string $status,
    ): AdvisoryResource {
        abort_unless($status === Advisory::STATUS_VALIDATED || $status === Advisory::STATUS_RETIRED, 404);

        $data = $request->validated();
        $provenance = $data['validation_provenance'] ?? null;

        $updated = DB::transaction(function () use ($advisory, $request, $provenance, $status): Advisory {
            $locked = Advisory::query()
                ->lockForUpdate()
                ->findOrFail($advisory->getKey());
            try {
                $locked->transitionTo($status, $request->user(), $provenance);
            } catch (LogicException $exception) {
                throw ValidationException::withMessages([
                    'status' => $exception->getMessage(),
                ]);
            }

            $locked->save();

            return $locked;
        });

        return new AdvisoryResource($updated->load(['validatedBy', 'retiredBy']));
    }

    public function setStatus(
        AdvisoryRequest $request,
        Advisory $advisory,
    ): AdvisoryResource {
        $status = $request->validated('status');
        if (! in_array($status, [Advisory::STATUS_VALIDATED, Advisory::STATUS_RETIRED], true)) {
            throw ValidationException::withMessages([
                'status' => 'An advisory can only transition to validated or retired.',
            ]);
        }

        $provenance = $request->validated('validation_provenance');
        $updated = DB::transaction(function () use ($advisory, $request, $provenance, $status): Advisory {
            $locked = Advisory::query()
                ->lockForUpdate()
                ->findOrFail($advisory->getKey());
            try {
                $locked->transitionTo($status, $request->user(), $provenance);
            } catch (LogicException $exception) {
                throw ValidationException::withMessages([
                    'status' => $exception->getMessage(),
                ]);
            }
            $locked->save();

            return $locked;
        });

        return new AdvisoryResource($updated->load(['validatedBy', 'retiredBy']));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function createWithGeneratedCode(array $data, User $user): Advisory
    {
        $generate = blank($data['code'] ?? null);
        for ($attempt = 1; ; $attempt++) {
            try {
                return DB::transaction(fn (): Advisory => Advisory::query()->create([
                    'code' => $generate ? $this->nextCode($data['category'] ?? null) : $data['code'],
                    'title' => $data['title'],
                    'content' => $data['content'],
                    'category' => $data['category'] ?? null,
                    'status' => Advisory::STATUS_VALIDATED,
                    'validation_provenance' => 'Created in the shared office advisory library.',
                    'created_by_id' => $user->getKey(),
                    'validated_by_id' => $user->getKey(),
                    'validated_at' => now()->utc(),
                ]));
            } catch (UniqueConstraintViolationException $exception) {
                // A concurrent create took the generated code; only a generated one is worth retrying.
                if (! $generate || $attempt >= 3) {
                    throw $exception;
                }
            }
        }
    }

    /** Next free `ADV-<CATEGORY>-NNN`, counting archived rows too because their codes stay reserved. */
    private function nextCode(?string $category): string
    {
        $prefix = 'ADV-'.strtoupper($category ?? Advisory::CATEGORY_GENERAL).'-';
        $highest = Advisory::query()
            ->withTrashed()
            ->where('code', 'like', $prefix.'%')
            ->pluck('code')
            ->map(fn (string $code): int => ctype_digit($suffix = substr($code, strlen($prefix))) ? (int) $suffix : 0)
            ->max() ?? 0;

        return $prefix.str_pad((string) ($highest + 1), 3, '0', STR_PAD_LEFT);
    }
}
