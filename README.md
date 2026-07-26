# CaneGuard Web Monorepo

CaneGuard is a local defense prototype for municipal agriculture staff to
review submitted sugarcane field observations. Model output is decision
support, not a diagnosis.

## Repository architecture

This repository contains two applications with separate runtime boundaries:

- React 19, TypeScript, and Vite at the repository root
- Laravel 13 and Sanctum in `api/`

There is one root Git repository. Do not initialize another repository inside
`api/`, move the React application, or expose API/database secrets through
`VITE_` variables.

## Requirements

- Node.js and npm compatible with Vite 8
- PHP 8.3–8.5 with PDO MySQL
- Composer
- MySQL 8.4 LTS

## Web setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

The web runs at `http://localhost:5173`. Values prefixed with `VITE_` are
public browser configuration.

## API and MySQL setup

Create MySQL databases named `caneguard` and `caneguard_test` with
`utf8mb4_unicode_ci`, then grant a dedicated local `caneguard_app` user access
to both.

```bash
npm run api:install
cp api/.env.example api/.env
php api/artisan key:generate
php api/artisan migrate
php api/artisan db:seed
```

Set the database password and the three local demo account passwords only in
`api/.env`. Never commit that file. The seeded accounts are:

- `field@caneguard.test`
- `mao@caneguard.test`
- `admin@caneguard.test`

## Local development

Run the applications in separate terminals:

```bash
npm run dev
```

```bash
npm run api:dev
```

The API runs at `http://localhost:8000`. Its readiness endpoint is
`GET http://localhost:8000/api/health`.

## Verification

```bash
npm run check:web
npm run check:api
npm run check:all
```

The API checks use Laravel feature tests and Pint. The web test suite is added
with the web API infrastructure phase.

## Presentation commands

Set `APP_DEBUG=false` in the uncommitted `api/.env` before the presentation,
then run:

```bash
npm run api:migrate
npm run api:seed
npm run check:all
npm run api:dev
npm run dev
```

Keep MySQL running on port `3306`, the API on `8000`, and the web on `5173`.
