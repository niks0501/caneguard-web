<?php

namespace App\Http\Controllers\Api\V2;

use App\Actions\Auth\ManageAccounts;
use App\Http\Controllers\Api\V1\WebAccountsController;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** @deprecated Use /api/v1/admin/accounts. Legacy writers are retained this release. */
final class AccountsController extends WebAccountsController
{
    public function review(Request $request, string $uuid, ManageAccounts $accounts): JsonResponse
    {
        $result = $accounts->handle($request, 'review', $uuid);
        $result['data'] = self::account(User::where('uuid', $uuid)->firstOrFail());

        return response()->json($result);
    }

    public function transfer(Request $request, ManageAccounts $accounts): JsonResponse
    {
        $result = $accounts->handle($request, 'transfer');
        $result['data'] = self::account(User::where('uuid', $request->input('to_uuid'))->firstOrFail());
        $result['affected'] = User::whereIn('uuid', [$request->input('from_uuid'), $request->input('to_uuid')])
            ->get()->map(fn (User $user) => self::account($user));

        return response()->json($result);
    }
}
