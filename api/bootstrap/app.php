<?php

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (
            AuthenticationException $exception,
            Request $request,
        ) {
            if (! $request->is('api/*', 'login', 'logout')) {
                return null;
            }

            return response()->json([
                'message' => 'Unauthenticated.',
                'code' => 'UNAUTHENTICATED',
            ], 401);
        });
        $exceptions->render(function (
            AuthorizationException $exception,
            Request $request,
        ) {
            if (! $request->is('api/*', 'login', 'logout')) {
                return null;
            }

            return response()->json([
                'message' => 'This action is unauthorized.',
                'code' => 'FORBIDDEN',
            ], 403);
        });
        $exceptions->render(function (
            ModelNotFoundException $exception,
            Request $request,
        ) {
            if (! $request->is('api/*', 'login', 'logout')) {
                return null;
            }

            return response()->json([
                'message' => 'The requested resource was not found.',
                'code' => 'NOT_FOUND',
            ], 404);
        });
        $exceptions->render(function (
            NotFoundHttpException $exception,
            Request $request,
        ) {
            if (! $request->is('api/*', 'login', 'logout')) {
                return null;
            }

            return response()->json([
                'message' => 'The requested resource was not found.',
                'code' => 'NOT_FOUND',
            ], 404);
        });
        $exceptions->render(function (
            ValidationException $exception,
            Request $request,
        ) {
            if (! $request->is('api/*', 'login', 'logout')) {
                return null;
            }

            return response()->json([
                'message' => 'The given data was invalid.',
                'code' => 'VALIDATION_ERROR',
                'errors' => $exception->errors(),
            ], 422);
        });
        $exceptions->render(function (
            TokenMismatchException $exception,
            Request $request,
        ) {
            if (! $request->is('api/*', 'login', 'logout')) {
                return null;
            }

            return response()->json([
                'message' => 'The CSRF token is invalid or expired.',
                'code' => 'CSRF_TOKEN_MISMATCH',
            ], 419);
        });
        $exceptions->render(function (
            HttpExceptionInterface $exception,
            Request $request,
        ) {
            if (! $request->is('api/*', 'login', 'logout')) {
                return null;
            }

            $status = $exception->getStatusCode();
            [$message, $code] = match ($status) {
                400 => ['The request could not be processed.', 'BAD_REQUEST'],
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

            return response()->json(
                ['message' => $message, 'code' => $code],
                $status,
                $exception->getHeaders(),
            );
        });
        $exceptions->render(function (
            Throwable $exception,
            Request $request,
        ) {
            if (! $request->is('api/*', 'login', 'logout')) {
                return null;
            }

            return response()->json([
                'message' => 'An unexpected server error occurred.',
                'code' => 'SERVER_ERROR',
            ], 500);
        });
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->expectsJson() || $request->is('api/*'),
        );
    })->create();
