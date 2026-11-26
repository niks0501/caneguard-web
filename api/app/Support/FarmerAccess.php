<?php

namespace App\Support;

use App\Models\User;

/**
 * What a farmer's Mobile token may do. Farmers never receive an inspector
 * capability: these abilities only reach the farmer's own requests and the
 * advisories the office chose to publish.
 */
final class FarmerAccess
{
    public const ACCOUNT_SECURITY = 'account:security';

    public const INQUIRY = 'farmer:inquiry';

    public static function inquiriesEnabled(): bool
    {
        return (bool) config('caneguard.farmer.inquiries_enabled');
    }

    /** @return array<int, string> */
    public static function abilities(): array
    {
        return [
            self::ACCOUNT_SECURITY,
            ...(self::inquiriesEnabled() ? [self::INQUIRY] : []),
        ];
    }

    /** Feature capabilities reported to the phone, without the security ability every token holds. */
    public static function capabilities(User $user): array
    {
        return $user->role === User::ROLE_FARMER
            ? array_values(array_diff(self::abilities(), [self::ACCOUNT_SECURITY]))
            : [];
    }
}
