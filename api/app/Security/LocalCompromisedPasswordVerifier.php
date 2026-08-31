<?php

namespace App\Security;

use Illuminate\Contracts\Validation\UncompromisedVerifier;

final class LocalCompromisedPasswordVerifier implements UncompromisedVerifier
{
    /**
     * Check the password against the locally configured SHA-1 breach list.
     *
     * The list is intentionally hash-only so offline development never needs
     * to persist or transmit a plaintext password.
     *
     * @param  array{value:mixed,threshold:int}  $data
     */
    public function verify($data): bool
    {
        $hash = strtoupper(hash('sha1', (string) ($data['value'] ?? '')));
        $threshold = (int) ($data['threshold'] ?? 0);

        foreach ((array) config('caneguard.auth.compromised_password_hashes', []) as $entry) {
            if (is_array($entry)) {
                $entryHash = strtoupper((string) ($entry['hash'] ?? ''));
                $count = (int) ($entry['count'] ?? 0);
            } else {
                $entryHash = strtoupper(trim((string) $entry));
                $count = 1;
            }

            if ($entryHash !== '' && hash_equals($entryHash, $hash) && $count > $threshold) {
                return false;
            }
        }

        return true;
    }
}
