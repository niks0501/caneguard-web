<?php

namespace App\Support;

/**
 * Stamps a phone feed with a content digest so an unchanged feed can answer
 * without resending its rows. The digest covers every row the feed would
 * serialize for the owner, so any visible change moves it.
 */
final class MobileFeedVersion
{
    /**
     * @param  iterable<array<string, mixed>>  $serializedRows
     * @param  array<string, mixed>  $metadata
     * @return array{version: string, total: int}
     */
    public static function digest(iterable $serializedRows, array $metadata = []): array
    {
        $hash = hash_init('sha256');
        hash_update($hash, json_encode($metadata, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE)."\n");
        $total = 0;
        foreach ($serializedRows as $row) {
            hash_update($hash, json_encode($row, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE)."\n");
            $total++;
        }

        return ['version' => substr(hash_final($hash), 0, 32), 'total' => $total];
    }
}
