<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\AdvisoryRequest;
use App\Http\Requests\AdvisoryTransitionRequest;
use App\Http\Resources\AdvisoryResource;
use App\Models\Advisory;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;

class AdvisoryController extends Controller
{
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

    public function store(AdvisoryRequest $request): AdvisoryResource
    {
        $data = $request->validated();
        if (blank($data['code'] ?? null)) {
            throw ValidationException::withMessages([
                'code' => 'An advisory code is required.',
            ]);
        }
        if (blank($data['title'] ?? null) || blank($data['content'] ?? null)) {
            throw ValidationException::withMessages([
                'content' => 'An advisory title and content are required.',
            ]);
        }

        $advisory = Advisory::query()->create([
            'code' => $data['code'],
            'title' => $data['title'],
            'content' => $data['content'],
            'status' => Advisory::STATUS_DRAFT,
            'created_by_id' => $request->user()->getKey(),
        ]);

        return new AdvisoryResource($advisory->load(['validatedBy', 'retiredBy']));
    }

    public function show(Advisory $advisory): AdvisoryResource
    {
        abort_unless(request()->user()?->isOfficeUser(), 403);

        return new AdvisoryResource($advisory->load(['validatedBy', 'retiredBy']));
    }

    public function update(AdvisoryRequest $request, Advisory $advisory): AdvisoryResource
    {
        if ($advisory->status !== Advisory::STATUS_DRAFT) {
            throw ValidationException::withMessages([
                'status' => 'Only draft advisories can be edited.',
            ]);
        }

        $data = $request->validated();
        $updated = DB::transaction(function () use ($advisory, $data): Advisory {
            $locked = Advisory::query()
                ->lockForUpdate()
                ->findOrFail($advisory->getKey());
            if ($locked->status !== Advisory::STATUS_DRAFT) {
                throw ValidationException::withMessages([
                    'status' => 'Only draft advisories can be edited.',
                ]);
            }
            $locked->update(collect($data)->only(['code', 'title', 'content'])->all());

            return $locked;
        });

        return new AdvisoryResource($updated->load(['validatedBy', 'retiredBy']));
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
}
