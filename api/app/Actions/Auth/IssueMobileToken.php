<?php

namespace App\Actions\Auth;

use App\Models\User;
use App\Security\DistrictAccess;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Laravel\Sanctum\NewAccessToken;

final class IssueMobileToken
{
    public const TOKEN_NAME_PREFIX = 'caneguard-mobile:';

    /**
     * @return array<int, string>
     */
    public static function abilities(?User $user = null): array
    {
        if ($user !== null && ! app(DistrictAccess::class)->inspector($user)) {
            return ['account:security'];
        }

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

        if (! $user->isMobileUser()) {
            throw new InvalidArgumentException('Only verified farmer and inspector identities may receive Mobile tokens.');
        }

        $tokenName = self::TOKEN_NAME_PREFIX.$deviceName;
        $expiresAt = now()->addDays(30);

        return DB::transaction(function () use ($deviceId, $expiresAt, $tokenName, $user): NewAccessToken {
            User::query()->whereKey($user->getKey())->lockForUpdate()->first();

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
                self::abilities($user),
                $expiresAt,
            );

            $token->accessToken->forceFill([
                'device_id' => $deviceId,
            ])->save();

            return $token;
        });
    }
}
