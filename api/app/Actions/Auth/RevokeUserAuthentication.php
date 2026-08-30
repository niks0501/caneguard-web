<?php

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

final class RevokeUserAuthentication
{
    public function handle(User $user): void
    {
        $user->tokens()->delete();

        DB::table((string) config('session.table', 'sessions'))
            ->where('user_id', $user->getAuthIdentifier())
            ->delete();
    }

    public function logoutCurrentWebSession(Request $request, User $user): void
    {
        if ((string) Auth::guard('web')->id() !== (string) $user->getAuthIdentifier()) {
            return;
        }

        Auth::guard('web')->logout();
        Auth::forgetGuards();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
    }
}
