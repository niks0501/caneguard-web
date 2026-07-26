# CaneGuard Monorepo Implementation Board

This board tracks the phase gates in the CaneGuard Web monorepo plan. A phase
is marked complete only after its required automated checks pass.

## Phase cards

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Baseline and scope lock | Complete |
| 1 | Create Laravel inside the existing repository | Not started |
| 2 | MySQL report API and storage | Not started |
| 3 | Web API infrastructure | Not started |
| 4 | Authentication and protected routes | Not started |
| 5 | Dashboard overview | Not started |
| 6 | Submitted reports list | Not started |
| 7 | Report detail, image, and review | Not started |
| 8 | Refresh, errors, and resilience | Not started |
| 9 | Testing, demo, and release | Not started |

## Phase 0 baseline

- Repository: one Git repository on branch `main`
- Baseline commit: `9ef2e499a460ce44d82e45e39ee4517d5c981020`
- Web application: React/Vite remains at the repository root
- API boundary: Laravel will be created only in `api/`
- Database: `caneguard` on MySQL 8.4 LTS
- Local ports: web `5173`, API `8000`, MySQL `3306`
- Scope exclusion: no CaneGuard Mobile implementation

### Existing user work preserved

- `.gitattributes` contains an uncommitted graphify merge-driver entry.
- `.gitignore` contains an uncommitted change that exposes `docs/`.
- `docs/` is untracked and is excluded from implementation commits.

### Tool baseline

- Node dependencies: `npm install` completed with the lockfile unchanged.
- PHP: 8.3.28 through the existing Laragon installation.
- Composer: 2.9.4 through the existing Laragon installation.
- MySQL client and server: 8.4.3 through the existing Laragon installation.
- MySQL reachability: `mysqladmin --host=127.0.0.1 --user=root ping`
  returned `mysqld is alive`.

### Web baseline checks

- `npm run lint`: passed
- `npx --no-install tsc --noEmit`: passed
- `npm run build`: passed
