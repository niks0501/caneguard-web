<?php

namespace App\Providers;

use App\Models\PersonalAccessToken;
use App\Models\Report;
use App\Policies\ReportPolicy;
use App\Security\LocalCompromisedPasswordVerifier;
use App\Support\AuthUrlBuilder;
use Illuminate\Auth\Middleware\Authenticate;
use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Validation\UncompromisedVerifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->extend(
            UncompromisedVerifier::class,
            fn (): LocalCompromisedPasswordVerifier => new LocalCompromisedPasswordVerifier,
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::policy(Report::class, ReportPolicy::class);
        Sanctum::usePersonalAccessTokenModel(PersonalAccessToken::class);
        Sanctum::authenticateAccessTokensUsing(static function (PersonalAccessToken $token, bool $valid): bool {
            return $valid && $token->expires_at !== null && $token->created_at !== null
                && $token->expires_at->lessThanOrEqualTo($token->created_at->copy()->addDays(30))
                && $token->created_at->greaterThan(now()->subDays(30));
        });

        $applicationUrl = trim((string) config('app.url'));
        $applicationUrlParts = parse_url($applicationUrl);
        if ($applicationUrl !== '' && is_array($applicationUrlParts) && isset($applicationUrlParts['scheme'], $applicationUrlParts['host'])) {
            URL::forceRootUrl(rtrim($applicationUrl, '/'));
            URL::forceScheme(strtolower((string) $applicationUrlParts['scheme']));
        }

        // API authentication must never attempt the browser-only login redirect.
        Authenticate::redirectUsing(static fn (Request $request): ?string => null);

        VerifyEmail::createUrlUsing(
            fn ($notifiable): string => app(AuthUrlBuilder::class)->verification($notifiable),
        );
        ResetPasswordNotification::createUrlUsing(
            fn ($notifiable, #[\SensitiveParameter] string $token): string => app(AuthUrlBuilder::class)
                ->passwordReset($notifiable, $token),
        );

        RateLimiter::for('login', function (Request $request) {
            $email = Str::lower(trim((string) $request->input('email')));
            $limits = config('caneguard.rate_limits.login', []);
            $perEmailIp = app()->environment('qa-staging')
                ? (int) ($limits['qa_per_email_ip_per_minute'] ?? 60)
                : (int) ($limits['per_email_ip_per_minute'] ?? 5);
            $perIp = (int) ($limits['per_ip_per_minute'] ?? 300);
            $global = (int) ($limits['global_per_minute'] ?? 3000);
            $ip = (string) $request->ip();

            return [
                Limit::perMinute($perEmailIp)->by(hash(
                    'sha256',
                    'login|email|'.$email.'|'.$ip,
                )),
                Limit::perMinute($perIp)->by(hash(
                    'sha256',
                    'login|ip|'.$ip,
                )),
                Limit::perMinute($global)->by('login|global'),
            ];
        });

        RateLimiter::for('register', fn (Request $request) => Limit::perMinute(5)->by(
            $this->authRateLimitKey($request, 'register'),
        ));
        RateLimiter::for('verification', fn (Request $request) => Limit::perMinute(5)->by(
            $this->authRateLimitKey($request, 'verification'),
        ));
        RateLimiter::for('password-reset', fn (Request $request) => Limit::perMinute(5)->by(
            $this->authRateLimitKey($request, 'password-reset'),
        ));
    }

    private function authRateLimitKey(Request $request, string $purpose): string
    {
        return hash(
            'sha256',
            $purpose.'|'.Str::lower(trim((string) $request->input('email'))).'|'.$request->ip(),
        );
    }
}
