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
        // Versioning invalidates every session backend, even replayed/in-flight sessions.
        DB::table('users')->where('id', $user->getKey())->update([
            'remember_token' => null,
            'auth_version' => DB::raw('auth_version + 1'),
        ]);
        $user->auth_version = (int) DB::table('users')->where('id', $user->getKey())->value('auth_version');

        $session = app('session.store');
        if ((string) $session->get(Auth::guard('web')->getName()) === (string) $user->getAuthIdentifier()) {
            $session->getHandler()->destroy($session->getId());
        }

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
