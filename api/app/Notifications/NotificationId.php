<?php

namespace App\Notifications;

final class NotificationId
{
    public static function for(string $recipientUuid, string $dedupeKey): string
    {
        $hex = hash('sha256', 'caneguard-notification|'.$recipientUuid.'|'.$dedupeKey);
        $hex = substr($hex, 0, 32);
        $hex[12] = '5';
        $hex[16] = dechex((hexdec($hex[16]) & 0x3) | 0x8);

        return substr($hex, 0, 8).'-'
            .substr($hex, 8, 4).'-'
            .substr($hex, 12, 4).'-'
            .substr($hex, 16, 4).'-'
            .substr($hex, 20, 12);
    }
}
