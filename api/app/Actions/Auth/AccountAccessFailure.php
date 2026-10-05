<?php

namespace App\Actions\Auth;

use Illuminate\Http\Exceptions\HttpResponseException;

final class AccountAccessFailure
{
    public static function reject(string $code, string $message, int $status = 409): never
    {
        throw new HttpResponseException(response()->json(compact('code', 'message'), $status));
    }
}
