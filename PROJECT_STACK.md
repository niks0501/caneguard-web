# Project Stack Guide — Laravel + React

## Laravel

- Prefer framework-native validation, authorization, routing, middleware, Eloquent/query builder, resources, queues/events, and testing.
- Keep authorization server-side.
- Avoid business logic accumulation in controllers.
- Use transactions for atomic multi-write operations.
- Prevent N+1 queries and unbounded fetches.
- Keep API response/error shapes consistent.
- Treat migrations as high-risk delivery changes.
- Prefer Pest/PHPUnit/Laravel test conventions already present.

## React

- Follow established component/routing/data-fetching conventions.
- Keep server state and local UI state separate.
- Handle async/empty/error states intentionally.
- Preserve accessibility and responsive behavior.

## Integration boundary

- Treat browser input as untrusted even when client-validated.
- Use CSRF/session/auth mechanisms correctly for the application's architecture.
- Keep API contracts stable and test request/response behavior.

## Documentation

When available, Laravel Boost is preferred for Laravel-aware project/documentation context.
Use current React/framework documentation for version-sensitive behavior.
