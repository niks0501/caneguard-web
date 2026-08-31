<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\URL;
use LogicException;

final class AuthUrlBuilder
{
    public function verification(User $user): string
    {
        $id = (string) $user->getKey();
        $hash = sha1($user->getEmailForVerification());
        $signedUrl = URL::temporarySignedRoute(
            'verification.verify',
            Carbon::now()->addMinutes((int) config('auth.verification.expire', 60)),
            [
                'id' => $id,
                'hash' => $hash,
            ],
        );
        $signedQuery = parse_url($signedUrl, PHP_URL_QUERY);
        parse_str(is_string($signedQuery) ? $signedQuery : '', $query);

        if (! isset($query['expires'], $query['signature'])) {
            throw new LogicException('The verification signature could not be generated.');
        }

        return $this->appendQuery(
            $this->configuredUrl('verification_url'),
            http_build_query([
                'id' => $id,
                'hash' => $hash,
                'expires' => $query['expires'] ?? null,
                'signature' => $query['signature'] ?? null,
            ], '', '&', PHP_QUERY_RFC3986),
        );
    }

    public function passwordReset(
        User $user,
        #[\SensitiveParameter] string $token,
    ): string {
        return $this->appendQuery(
            $this->configuredUrl('password_reset_url'),
            http_build_query([
                'token' => $token,
                'email' => $user->getEmailForPasswordReset(),
            ], '', '&', PHP_QUERY_RFC3986),
        );
    }

    private function configuredUrl(string $key): string
    {
        $url = trim((string) config("caneguard.auth.{$key}"));
        $parts = parse_url($url);

        if ($url === '' || $parts === false || ! isset($parts['scheme'], $parts['host'])) {
            throw new LogicException("The caneguard.auth.{$key} value must be an absolute URL.");
        }

        if (app()->environment('production') && $parts['scheme'] !== 'https') {
            throw new LogicException("The caneguard.auth.{$key} value must use HTTPS in production.");
        }

        return rtrim($url, '?&');
    }

    private function appendQuery(string $url, string $query): string
    {
        if ($query === '') {
            return $url;
        }

        $separator = str_contains($url, '?') ? '&' : '?';

        return $url.$separator.$query;
    }
}
