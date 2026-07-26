<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\AuthenticatedUserRequest;
use App\Http\Resources\AuthenticatedUserResource;

class AuthenticatedUserController extends Controller
{
    public function __invoke(
        AuthenticatedUserRequest $request,
    ): AuthenticatedUserResource {
        return new AuthenticatedUserResource($request->user());
    }
}
