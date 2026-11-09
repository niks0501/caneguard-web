<?php

namespace App\Notifications;

use App\Contracts\MobileNotificationContract;
use InvalidArgumentException;
use UnexpectedValueException;

/**
 * Producer-side guard for the fields the mobile feed contract requires.
 * A notification that would fail the phone's refresh is refused when it is
 * created instead of being stored and skipped later.
 *
 * The text bounds are read from docs/contracts/mobile-notifications-v1.json,
 * the one owner of the wire shape, so a contract widening or tightening
 * reaches producers without editing these constants by hand.
 */
final class NotificationPayload
{
    /**
     * Producer payload field => its declaration path in the contract.
     *
     * @var array<string, string>
     */
    private const CONTRACT_PATHS = [
        'event_type' => 'event_type',
        'title' => 'title',
        'message' => 'message',
        'reference_code' => 'case.properties.reference_code',
    ];

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function assertDeliverable(array $payload): array
    {
        foreach (['event_type', 'title', 'message'] as $field) {
            $value = $payload[$field] ?? null;
            if (! is_string($value) || trim($value) === '') {
                throw new InvalidArgumentException("Notification {$field} must be a non-empty string.");
            }

            $max = self::maxLength($field);
            if (mb_strlen($value) > $max) {
                throw new InvalidArgumentException("Notification {$field} exceeds {$max} characters.");
            }
        }

        $reference = $payload['reference_code'] ?? null;
        $max = self::maxLength('reference_code');
        if ($reference !== null && (! is_string($reference) || mb_strlen($reference) > $max)) {
            throw new InvalidArgumentException("Notification reference_code must be a string of at most {$max} characters.");
        }

        return $payload;
    }

    private static function maxLength(string $field): int
    {
        $path = self::CONTRACT_PATHS[$field];
        $declaration = MobileNotificationContract::definition()['fields'];

        foreach (explode('.', $path) as $segment) {
            $declaration = is_array($declaration) ? ($declaration[$segment] ?? null) : null;
            if (! is_array($declaration)) {
                throw new UnexpectedValueException(
                    "The mobile notification contract does not declare {$path}.",
                );
            }
        }

        $max = $declaration['max_length'] ?? null;
        if (! is_int($max)) {
            throw new UnexpectedValueException(
                "The mobile notification contract does not bound {$path}.",
            );
        }

        return $max;
    }
}
