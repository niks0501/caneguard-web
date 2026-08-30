<?php

namespace App\Providers;

use App\Models\PersonalAccessToken;
use App\Models\Report;
use App\Policies\ReportPolicy;
use App\Security\LocalCompromisedPasswordVerifier;
use App\Support\AuthUrlBuilder;
use Illuminate\Auth\Notifications\ResetPassword as ResetPasswordNotification;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Validation\UncompromisedVerifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
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

        VerifyEmail::createUrlUsing(
            fn ($notifiable): string => app(AuthUrlBuilder::class)->verification($notifiable),
        );
        ResetPasswordNotification::createUrlUsing(
            fn ($notifiable, #[\SensitiveParameter] string $token): string => app(AuthUrlBuilder::class)
                ->passwordReset($notifiable, $token),
        );

        RateLimiter::for('login', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));

            $perMinute = app()->environment('qa-staging') ? 60 : 5;

            return Limit::perMinute($perMinute)->by(hash(
                'sha256',
                $email.'|'.$request->ip(),
            ));
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
