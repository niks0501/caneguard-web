<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\ForgotPasswordRequest;
use App\Models\User;
use App\Support\BootstrapAdministrator;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Password;

class ForgotPasswordController extends Controller
{
    public function __invoke(ForgotPasswordRequest $request): JsonResponse
    {
        $email = $request->validated('email');
        $user = User::query()->where('email', $email)->first();
        if (! $user instanceof User || ! BootstrapAdministrator::superseded($user)) {
            Password::broker()->sendResetLink(['email' => $email]);
        }

        return response()->json([
            'message' => 'If an account matches, a password recovery link will be sent.',
            'code' => 'PASSWORD_RESET_LINK_SENT',
        ], 202);
    }
}
