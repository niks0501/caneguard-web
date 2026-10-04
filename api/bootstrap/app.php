<?php

use App\Http\Middleware\EnsureMobileTokenFresh;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Exceptions\InvalidSignatureException;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Http\Middleware\CheckAbilities;
use Laravel\Sanctum\Http\Middleware\CheckForAnyAbility;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(__DIR__.'/../routes/channels.php', [
        'middleware' => ['web', 'auth'],
    ])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->trustHosts(
            at: fn (): array => config('app.trusted_hosts', []),
            subdomains: false,
        );
        $middleware->append(SecurityHeaders::class);
        $middleware->statefulApi();
        $middleware->alias([
            'abilities' => CheckAbilities::class,
            'ability' => CheckForAnyAbility::class,
            'mobile.token' => EnsureMobileTokenFresh::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $respond = static function (
            Request $request,
            array $payload,
            int $status,
            array $headers = [],
        ): Response {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json($payload, $status, $headers);
            }

            return response(
                '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Request error</title></head><body><h1>Request could not be completed</h1><p>Please try again later.</p></body></html>',
                $status,
                array_merge(['Content-Type' => 'text/html; charset=UTF-8'], $headers),
            );
        };

        $exceptions->respond(static function (
            Response $response,
            Throwable $exception,
            Request $request,
        ): Response {
            return SecurityHeaders::apply($request, $response);
        });

        $exceptions->render(function (
            InvalidSignatureException $exception,
            Request $request,
        ) use ($respond) {
            if ($request->is('email/verify/*')) {
                return $respond($request, [
                    'message' => 'The verification link is invalid or expired.',
                    'code' => 'INVALID_VERIFICATION_LINK',
                ], 403);
            }

            return $respond($request, [
                'message' => 'The request could not be processed.',
                'code' => 'HTTP_ERROR',
            ], 403);
        });
        $exceptions->render(function (
            AuthenticationException $exception,
            Request $request,
        ) use ($respond) {
            return $respond($request, [
                'message' => 'Unauthenticated.',
                'code' => 'UNAUTHENTICATED',
            ], 401);
        });
        $exceptions->render(function (
            AuthorizationException $exception,
            Request $request,
        ) use ($respond) {
            return $respond($request, [
                'message' => 'This action is unauthorized.',
                'code' => 'FORBIDDEN',
            ], 403);
        });
        $exceptions->render(function (
            ModelNotFoundException $exception,
            Request $request,
        ) use ($respond) {
            return $respond($request, [
                'message' => 'The requested resource was not found.',
                'code' => 'NOT_FOUND',
            ], 404);
        });
        $exceptions->render(function (
            NotFoundHttpException $exception,
            Request $request,
        ) use ($respond) {
            return $respond($request, [
                'message' => 'The requested resource was not found.',
                'code' => 'NOT_FOUND',
            ], 404);
        });
        $exceptions->render(function (
            ValidationException $exception,
            Request $request,
        ) use ($respond) {
            return $respond($request, [
                'message' => 'The given data was invalid.',
                'code' => 'VALIDATION_ERROR',
                'errors' => $exception->errors(),
            ], 422);
        });
        $exceptions->render(function (
            TokenMismatchException $exception,
            Request $request,
        ) use ($respond) {
            return $respond($request, [
                'message' => 'The CSRF token is invalid or expired.',
                'code' => 'CSRF_TOKEN_MISMATCH',
            ], 419);
        });
        $exceptions->render(function (
            HttpExceptionInterface $exception,
            Request $request,
        ) use ($respond) {
            $status = $exception->getStatusCode();
            [$message, $code] = match ($status) {
                400 => ['The request could not be processed.', 'BAD_REQUEST'],
                401 => ['Unauthenticated.', 'UNAUTHENTICATED'],
                403 => ['This action is unauthorized.', 'FORBIDDEN'],
                404 => ['The requested resource was not found.', 'NOT_FOUND'],
                405 => ['The HTTP method is not allowed.', 'METHOD_NOT_ALLOWED'],
                409 => ['The request conflicts with the current state.', 'CONFLICT'],
                419 => ['The CSRF token is invalid or expired.', 'CSRF_TOKEN_MISMATCH'],
                429 => ['Too many requests.', 'RATE_LIMITED'],
                503 => ['The service is temporarily unavailable.', 'SERVICE_UNAVAILABLE'],
                default => $status >= 500
                    ? ['An unexpected server error occurred.', 'SERVER_ERROR']
                    : ['The request could not be processed.', 'HTTP_ERROR'],
            };

            $payload = ['message' => $message, 'code' => $code];
            $path = $request->path();
            $clientUuid = $request->input('client_uuid');

            if (
                $status === 409
                && in_array($path, ['api/v1/mobile/reports', 'api/v2/mobile/reports'], true)
                && is_string($clientUuid)
            ) {
                $payload['client_uuid'] = $clientUuid;
            }

            return $respond(
                $request,
                $payload,
                $status,
                $exception->getHeaders(),
            );
        });
        $exceptions->render(function (
            Throwable $exception,
            Request $request,
        ) use ($respond) {
            return $respond($request, [
                'message' => 'An unexpected server error occurred.',
                'code' => 'SERVER_ERROR',
            ], 500);
        });
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->expectsJson() || $request->is('api/*'),
        );
    })->create();
