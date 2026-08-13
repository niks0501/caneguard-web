<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Mobile report review status contract

The existing mobile feed is `GET /api/v1/mobile/reports/statuses`. It requires a
Sanctum bearer token with `report:status` and is owner-scoped to Field Reporters;
reviewers and admins cannot read this mobile feed. Reviewer and admin mutation
continues through `PATCH /api/v1/reports/{report}/review` with optimistic
`expected_version` checks.

Each status item is the current snapshot with this exact shape:

```json
{
  "uuid": "server-report-uuid",
  "client_uuid": "stable-mobile-report-uuid",
  "reference_code": "CG-20260813-AB12CD34",
  "review_status": "verified_by_staff",
  "review_notes": "Latest plain-text authority note or null",
  "reviewed_at": "2026-08-13T10:20:30.123000Z",
  "updated_at": "2026-08-13T10:20:31.456000Z"
}
```

The five wire states are `submitted_unverified`, `for_field_validation`,
`verified_by_staff`, `unable_to_verify`, and `resolved`. Notes are the latest
optional plain-text note only; there is no review history or threaded reply
contract. Reviewer identity is deliberately omitted from the mobile feed; mobile
may present generic `Authority staff` attribution.

The response retains top-level `data`, `links`, and `meta` keys and includes
`sync.before`. Cursor pagination is ordered by `(updated_at, id)`; clients keep
that `sync.before` checkpoint while consuming the returned cursor links. The
optional `updated_after` parameter supports incremental reads and `per_page` is
limited to 100.

Repeated submission with the same `(reporter_id, client_uuid)` returns the
existing logical report and does not reset its review status, note, reviewer,
reviewed time, or lock version. This P1 slice adds no push, unread state, replies,
history, referral workflow, analytics, optional fields, or competing endpoint.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework.

In addition, [Laracasts](https://laracasts.com) contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

You can also watch bite-sized lessons with real-world projects on [Laravel Learn](https://laravel.com/learn), where you will be guided through building a Laravel application from scratch while learning PHP fundamentals.

## Agentic Development

Laravel's predictable structure and conventions make it ideal for AI coding agents like Claude Code, Cursor, and GitHub Copilot. Install [Laravel Boost](https://laravel.com/docs/ai) to supercharge your AI workflow:

```bash
composer require laravel/boost --dev

php artisan boost:install
```

Boost provides your agent 15+ tools and skills that help agents build Laravel applications while following best practices.

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
