<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\ExpertDirectoryRequest;
use App\Http\Resources\ExpertDirectoryResource;
use App\Models\User;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class ExpertDirectoryController extends Controller
{
    public function __invoke(ExpertDirectoryRequest $request): AnonymousResourceCollection
    {
        return ExpertDirectoryResource::collection(
            User::query()
                ->where('role', User::ROLE_EXPERT)
                ->orderBy('name')
                ->orderBy('id')
                ->get(['id', 'uuid', 'name', 'email']),
        );
    }
}
