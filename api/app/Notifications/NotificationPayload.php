<?php

namespace App\Notifications;

use InvalidArgumentException;

/**
 * Producer-side guard for the fields the mobile feed contract requires.
 * A notification that would fail the phone's refresh is refused when it is
 * created instead of being stored and skipped later.
 */
final class NotificationPayload
{
    private const LIMITS = ['event_type' => 80, 'title' => 160, 'message' => 500];

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public static function assertDeliverable(array $payload): array
    {
        foreach (self::LIMITS as $field => $max) {
            $value = $payload[$field] ?? null;
            if (! is_string($value) || trim($value) === '') {
                throw new InvalidArgumentException("Notification {$field} must be a non-empty string.");
            }
            if (mb_strlen($value) > $max) {
                throw new InvalidArgumentException("Notification {$field} exceeds {$max} characters.");
            }
        }

        $reference = $payload['reference_code'] ?? null;
        if ($reference !== null && (! is_string($reference) || mb_strlen($reference) > 32)) {
            throw new InvalidArgumentException('Notification reference_code must be a string of at most 32 characters.');
        }

        return $payload;
    }
}
