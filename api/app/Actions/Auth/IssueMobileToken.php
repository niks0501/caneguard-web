<?php

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Laravel\Sanctum\NewAccessToken;

final class IssueMobileToken
{
    public const TOKEN_NAME_PREFIX = 'caneguard-mobile:';

    /**
     * @return array<int, string>
     */
    public static function abilities(): array
    {
        return [
            'report:submit',
            'report:status',
            'assignment:read',
            'assignment:complete',
            'notification:read',
        ];
    }

    public function handle(
        User $user,
        string $deviceName,
        string $deviceId,
    ): NewAccessToken {
        if (trim($deviceName) === '' || trim($deviceId) === '') {
            throw new InvalidArgumentException('A mobile device name and identity are required.');
        }

        $tokenName = self::TOKEN_NAME_PREFIX.$deviceName;
        // Mobile sessions are revoked explicitly, not by a fixed time window.
        $expiresAt = null;

        return DB::transaction(function () use ($deviceId, $expiresAt, $tokenName, $user): NewAccessToken {
            $user = User::query()->whereKey($user->getKey())->lockForUpdate()->firstOrFail();
            if (! $user->hasVerifiedEmail()
                || (! $user->isFieldReporter() && $user->role !== User::ROLE_FARMER)) {
                throw new InvalidArgumentException('This account is not eligible for a mobile session.');
            }

            $user->tokens()
                ->where(function ($query) use ($deviceId, $tokenName): void {
                    $query
                        ->where('device_id', $deviceId)
                        ->orWhere(function ($legacyQuery) use ($tokenName): void {
                            $legacyQuery
                                ->whereNull('device_id')
                                ->where('name', $tokenName);
                        });
                })
                ->delete();

            $token = $user->createToken(
                $tokenName,
                $user->isFieldReporter() ? self::abilities() : [],
                $expiresAt,
            );

            $token->accessToken->forceFill([
                'device_id' => $deviceId,
            ])->save();

            return $token;
        });
    }
}
