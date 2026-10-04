<?php

namespace App\Http\Controllers\Auth;

use App\Actions\Auth\RecordSecurityAudit;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterRequest;
use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class RegisterController extends Controller
{
    public function __invoke(
        RegisterRequest $request,
        RecordSecurityAudit $audits,
    ): JsonResponse {
        $user = DB::transaction(function () use ($audits, $request): User {
            $user = User::query()->create([
                'name' => $request->validated('name'),
                'email' => $request->validated('email'),
                'role' => User::ROLE_FARMER,
                'email_verified_at' => null,
                'password' => $request->validated('password'),
            ]);
            $audits->handle(
                SecurityAudit::ACTION_REGISTRATION,
                SecurityAudit::OUTCOME_SUCCESS,
                target: $user,
            );

            return $user;
        });
        $user->sendEmailVerificationNotification();

        return response()->json([
            'message' => 'Account created. Verify your email address before signing in.',
            'code' => 'REGISTRATION_CREATED',
            'user' => [
                'uuid' => $user->uuid,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $user->role,
                'email_verified' => $user->hasVerifiedEmail(),
            ],
        ], 201);
    }
}
