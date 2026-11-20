<?php

namespace App\Support;

use Closure;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Stops reset-link and set-password issuance while a rollback revokes links and switches releases. Every issuance
 * runs its transaction while holding the barrier lock, so engage() returns only after in-flight issuance commits,
 * and any issuance admitted afterwards sees the flag and refuses. The flag lives in the shared cache store, so the
 * web, queue and operator processes all see it.
 */
final class RollbackBarrier
{
    public const FLAG = 'auth:rollback-barrier';

    private const LOCK = 'auth:rollback-barrier:issuance';

    private const LOCK_SECONDS = 60;

    public static function engage(): void
    {
        Cache::lock(self::LOCK, self::LOCK_SECONDS)->block(self::LOCK_SECONDS, fn () => Cache::forever(self::FLAG, true));
    }

    public static function release(): void
    {
        Cache::lock(self::LOCK, self::LOCK_SECONDS)->block(self::LOCK_SECONDS, fn () => Cache::forget(self::FLAG));
    }

    /**
     * Runs $write in a database transaction while holding the barrier. Returns null, without running $write, when the
     * barrier is engaged or the lock is busy; callers treat null as a refusal rather than waiting for a rollback.
     */
    public static function issue(Closure $write): mixed
    {
        try {
            return Cache::lock(self::LOCK, self::LOCK_SECONDS)->block(30, function () use ($write): mixed {
                if (Cache::get(self::FLAG) === true) {
                    return null;
                }

                return DB::transaction($write);
            });
        } catch (LockTimeoutException) {
            return null;
        }
    }
}
