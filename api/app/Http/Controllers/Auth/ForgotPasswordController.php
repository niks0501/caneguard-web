<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\ForgotPasswordRequest;
use App\Models\User;
use App\Support\BootstrapAdministrator;
use App\Support\MailDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

class ForgotPasswordController extends Controller
{
    public function __invoke(ForgotPasswordRequest $request): JsonResponse
    {
        try {
            $email = $request->validated('email');
            $user = User::query()->where('email', $email)->first();
            if (! $user instanceof User || ! BootstrapAdministrator::superseded($user)) {
                MailDelivery::sendResetLink(['email' => $email]);
            }
        } catch (\Throwable $e) {
            Log::warning('Password recovery link could not be sent.', ['exception' => $e::class]);
        }

        return response()->json([
            'message' => 'If an account matches, a password recovery link will be sent.',
            'code' => 'PASSWORD_RESET_LINK_SENT',
        ], 202);
    }
}
