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

        return $this->withQuery(
            $this->configuredUrl('verification_url'),
            [
                'id' => $id,
                'hash' => $hash,
                'expires' => $query['expires'],
                'signature' => $query['signature'],
            ],
        );
    }

    public function assertPasswordResetUrl(): void
    {
        $this->configuredUrl('password_reset_url');
    }

    public function passwordReset(
        User $user,
        #[\SensitiveParameter] string $token,
    ): string {
        return $this->withQuery(
            $this->configuredUrl('password_reset_url'),
            [
                'token' => $token,
                'email' => $user->getEmailForPasswordReset(),
            ],
        );
    }

    private function configuredUrl(string $key): string
    {
        $url = trim((string) config("caneguard.auth.{$key}"));
        $parts = parse_url($url);

        if ($url === '' || $parts === false || ! isset($parts['scheme'], $parts['host'])) {
            throw new LogicException("The caneguard.auth.{$key} value must be an absolute URL.");
        }

        if (isset($parts['fragment']) || isset($parts['user']) || isset($parts['pass'])) {
            throw new LogicException("The caneguard.auth.{$key} value must not contain a fragment or credentials.");
        }

        if (app()->environment('production') && $parts['scheme'] !== 'https') {
            throw new LogicException("The caneguard.auth.{$key} value must use HTTPS in production.");
        }

        return rtrim($url, '?&');
    }

    /** @param  array<string, string>  $params */
    private function withQuery(string $url, array $params): string
    {
        [$base, $existing] = array_pad(explode('?', $url, 2), 2, '');
        $pairs = array_values(array_filter(
            explode('&', $existing),
            fn (string $pair): bool => $pair !== '' && ! array_key_exists(urldecode(explode('=', $pair, 2)[0]), $params),
        ));
        $pairs[] = http_build_query($params, '', '&', PHP_QUERY_RFC3986);

        return $base.'?'.implode('&', $pairs);
    }
}
