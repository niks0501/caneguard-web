<?php

namespace App\Support;

use Closure;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Pauses reset-link and set-password issuance while an operator-driven rollback is in progress. The operator engages
 * it after stopping writers and confirming the drain; issuance then refuses with RollbackInProgress instead of
 * writing. The flag lives in the shared cache store, so web and operator processes read the same value.
 */
final class RollbackBarrier
{
    public const FLAG = 'auth:rollback-barrier';

    public static function engage(): void
    {
        Cache::forever(self::FLAG, true);
        if (Cache::get(self::FLAG) !== true) {
            throw new \RuntimeException('The rollback barrier could not be engaged; issuance is not paused.');
        }
    }

    public static function release(): void
    {
        Cache::forget(self::FLAG);
        if (Cache::has(self::FLAG)) {
            throw new \RuntimeException('The rollback barrier could not be released; issuance remains paused.');
        }
    }

    /** Runs $write in a database transaction after checking the flag, so a refused issuance writes nothing. */
    public static function issue(Closure $write): mixed
    {
        if (Cache::get(self::FLAG) === true) {
            throw new RollbackInProgress('Reset links and invites are paused during a rollback; retry after the rollback finishes.');
        }

        return DB::transaction($write);
    }
}
