<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\ForgotPasswordRequest;
use App\Models\User;
use App\Support\BootstrapAdministrator;
use App\Support\MailDelivery;
use Illuminate\Http\JsonResponse;

class ForgotPasswordController extends Controller
{
    public function __invoke(ForgotPasswordRequest $request): JsonResponse
    {
        $email = $request->validated('email');
        $user = User::query()->where('email', $email)->first();
        if (! $user instanceof User || ! BootstrapAdministrator::superseded($user)) {
            MailDelivery::sendResetLink(['email' => $email]);
        }

        return response()->json([
            'message' => 'If an account matches, a password recovery link is sent when mail is available. If none arrives, ask an administrator to issue a set-password link.',
            'code' => 'PASSWORD_RESET_LINK_SENT',
        ], 202);
    }
}
