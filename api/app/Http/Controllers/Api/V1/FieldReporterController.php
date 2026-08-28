<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\FieldReporterListRequest;
use App\Http\Resources\FieldReporterResource;
use App\Models\User;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class FieldReporterController extends Controller
{
    public function __invoke(FieldReporterListRequest $request): AnonymousResourceCollection
    {
        return FieldReporterResource::collection(
            User::query()
                ->where('role', User::ROLE_FIELD_REPORTER)
                ->orderBy('name')
                ->orderBy('id')
                ->get(['id', 'uuid', 'name']),
        );
    }
}
