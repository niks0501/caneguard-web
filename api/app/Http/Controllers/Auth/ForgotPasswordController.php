<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\ForgotPasswordRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Password;

class ForgotPasswordController extends Controller
{
    public function __invoke(ForgotPasswordRequest $request): JsonResponse
    {
        Password::broker()->sendResetLink([
            'email' => $request->validated('email'),
        ]);

        return response()->json([
            'message' => 'If an account matches, a password recovery link will be sent.',
            'code' => 'PASSWORD_RESET_LINK_SENT',
        ], 202);
    }
}
