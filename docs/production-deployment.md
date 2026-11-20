# CaneGuard Web manual production deployment

This workflow deploys **only** the Web/Laravel application to the existing Lightsail server at https://caneguard.online. It is not triggered by pushes or pull requests. It is invoked manually on `main` with confirmation `deploy-caneguard`, and it uses the `production` GitHub environment.

## Server baseline
- `deploy` must own and write `/var/www/caneguard/releases` and the parent `/var/www/caneguard`. No sudo access is required by the workflow.
- `/var/www/caneguard/current` must be a symlink to a release directory.
- The existing persistent `/var/www/caneguard/shared/api/.env` and `shared/api/storage` must exist, have correct restrictive access, and remain outside releases.
- PHP 8.3+, Composer 2, PHP extensions, Nginx, MySQL, and DNS/HTTPS must already be operational.
- `/var/www/caneguard/current/api/public` must be the Nginx document root.
- The server's `deploy` account must have `flock`, `tar`, `sha256sum`, `curl`, `id`, `crontab` (Ubuntu package `cron`) and PHP 8.3+ CLI with `proc_open` enabled.
- On the VPS, `ubuntu` must install the `acl` package (`sudo apt-get update && sudo apt-get install -y acl`). This provides `setfacl` and `getfacl` to the `deploy` account.
- `deploy` must own release files created by the deployment. After Composer and Laravel cache preparation, the script grants PHP-FPM user `www-data` read/traverse ACL permissions on the new release using a physical (`-P`) walk. Permission changes never follow the persistent `.env` or `storage` symlinks. No recursive `chgrp`, no broad `other` read access, and no sudo grant to `deploy`.
- The FPM pool must run as `www-data` with the primary/supplementary groups reported by `id -G www-data`. The read-only preflight evaluates numeric POSIX access ACLs (including masks, owner/named-user precedence and matching groups) for that identity, not the deploying account. It checks ancestor traversal, release/application/vendor/frontend readability, generated `bootstrap/cache/config.php` and compiled views, shared `.env` readability, and read/write/search on shared runtime directories plus read/write on existing runtime files. Missing artifacts or denied/unknown metadata abort before migrations and activation, without printing file contents or changing shared permissions.
- An administrator must provision restrictive shared runtime permissions (including inheritance for newly compiled views and logs), confirm the FPM identity/group baseline, and review release-parent default ACLs. `setfacl` recalculates masks and can unmask pre-existing named/group permissions; this workflow does not guarantee isolation from unexpected inherited ACL entries.
- These are filesystem entrypoint/artifact checks, not proof that PHP-FPM or Nginx can serve the release. They assume ordinary Linux POSIX ACL semantics and stable filesystem/identity metadata during deployment; they do not test service configuration, MAC policies, read-only mounts, quotas or OPcache. The post-activation HTTPS readiness checks remain required.
- Before first run, verify the archive destination and shared state permissions. The workflow does not change host configuration.

## SSH credentials, configured manually
1. Create an unencrypted dedicated ed25519 key on your **local Windows PowerShell**. Keep the private key out of chat and Git.
2. Install only its public key for the server `deploy` account in `~deploy/.ssh/authorized_keys` with restrictive permissions.
3. Obtain the Lightsail server's ed25519 SSH host **public** key through your already trusted Lightsail browser SSH session:
   `sudo cat /etc/ssh/ssh_host_ed25519_key.pub`. Verify its fingerprint independently.
4. Put the line `caneguard.online ssh-ed25519 AAAA... ` (using the exact trusted host public key) into GitHub Actions secret `CANEGUARD_DEPLOY_KNOWN_HOSTS`.
5. Store the complete new SSH private key as GitHub Actions secret `CANEGUARD_DEPLOY_SSH_KEY`.
6. Configure GitHub environment `production` with manual reviewer approval and allowed branch `main`, if available.

The workflow refuses unknown host keys. Do not use `ssh-keyscan` as an unverified source of trust.

## Release behavior
- The workflow checks out the triggering `main` revision, runs Web/API verification and dependency audits, and builds React with production origin values.
- It packages tracked source and compiled assets, hashes the archive, and uploads over authenticated SSH.
- A server lock prevents simultaneous releases. Each release gets a unique directory.
- Server links production `.env` and `storage`, installs Composer dependencies without dev packages, prepares Laravel, and runs `migrate --force` against the existing database.
- Right after migration it runs `php artisan caneguard:bootstrap` and ensures the deploy user's scheduler cron (see "Go-live bootstrap" and the scheduler section below). Both are idempotent, so every deploy repeats them safely.
- After migration succeeds, it atomically switches `current` to the new code and verifies HTTPS API readiness and the frontend.
- The frontend check fetches `/` and fails with `SPA shell served without a CSP nonce` when the built `__CSP_NONCE__` placeholder is still present. Nginx must route the shell through `index.php`, as the Laravel route substitutes the per-response CSP nonce into the theme script; a static `api/public/index.html` leaves the placeholder in place and trips this check.
- On an activation health-check failure, it restores the old code symlink. **Database migrations are not rolled back.** This is a code rollback, not a full transactional deploy.
- No `migrate:fresh`, `db:seed`, `key:generate`, or database reset runs on production. `caneguard:bootstrap` is not a seeder: it adds only a missing pilot district and first admin, deactivates an earlier pending first admin when the configured address changes, and never deletes accounts or audit rows.
- Existing previous releases are retained. No automatic pruning.

## Release safety
- Back up MySQL before a deployment that changes the schema. Review all migrations and ensure they are backward compatible with the previous release.
- A failed migration can leave a changed database even if the code release is not activated.
- PHP-FPM OPcache may keep old scripts depending on its configuration. Verify its validation settings before claiming instantaneous switchovers.
- A queued worker or Reverb process, if later enabled, needs separate supervised restart/reload policy. This workflow does not restart either service.
- Keep the existing baseline release until the new pipeline has completed a successful dry assessment and manual production run.
- Do not run this workflow until the PR is reviewed, secrets are configured, and SSH permissions are checked.

## Manual operation
GitHub > Actions > Deploy CaneGuard Web (manual) > Run workflow > branch `main` > enter `deploy-caneguard`.

After a deployment fix is merged, start a **new** dispatch and verify its SHA contains the fix. Do not rerun an old failed run: reruns reuse the old revision and release identity, which can collide with retained failed-release directories.

The workflow needs the dedicated `deploy` key; your personal workstation SSH key is not needed. View Actions logs after each run. A passed deployment should show `PASS: Active release`.

## Shared `.env` template
`api/.env.production.example` lists the production values (HTTPS `FRONTEND_URL`, host-only session cookie, `SANCTUM_STATEFUL_DOMAINS`, MySQL, `BROADCAST_CONNECTION=null`, `LOG_LEVEL=warning`). Do not copy `api/.env.example` to production: its `APP_ENV=local`, `SESSION_DOMAIN=localhost`, localhost Sanctum domains, `LOG_LEVEL=debug` and `BROADCAST_CONNECTION=reverb` break sign-in (419 on `/login`, 401 right after it) or stop the app booting. `php artisan db:seed` refuses to run in production.

## Accepted model versions
The shared `.env` sets `CANEGUARD_ACCEPTED_MODEL_VERSIONS=v2.0-mobilenetv2,v1.0-mobilenetv2` (also the code default), so the shipped phone's `v2.0-mobilenetv2` and the earlier `v1.0-mobilenetv2` are both recognised. It is recognition only: an unlisted version still persists and shows the office warning. Run `php artisan config:cache` in the active release after changing it.

## Server upload limits (check before relying on photo uploads)
The deploy workflow and both preflights do not check the web server's upload limits, and the phone sends the original photo (the contract allows 10 MiB; a smaller phone-side target is tracked separately and does not change these server limits). Set these production values on the server, as `ubuntu`, and check them before a go-live and after any PHP or nginx change:

| Layer | Setting | Needs | Check |
|---|---|---|---|
| nginx | `client_max_body_size` | `16m` or more (default 1 MB answers 413 with an HTML page) | `sudo nginx -T 2>/dev/null \| grep client_max_body_size` |
| PHP-FPM | `upload_max_filesize` | `12M` or more (default 2M) | `php-fpm8.3 -i \| grep -E '^(upload_max_filesize\|post_max_size)'` on the FPM binary, not the CLI |
| PHP-FPM | `post_max_size` | `16M` or more (default 8M) | same command |
| nginx | `fastcgi_read_timeout` | above `60s` only if aerial analysis is on (it runs inside the web request) | `sudo nginx -T 2>/dev/null \| grep fastcgi_read_timeout` |

A limit that is too low makes the phone file the report as a non-retryable failure, so it stays on the phone. Verify with a real photo near 10 MiB after changing a limit: the upload should answer `201`, not `413` or `422`.

## Weekly send needs operations that production does not run yet
Production currently runs no queue worker and no mail. Until both are provisioned:
- Weekly send must stay off (`CANEGUARD_WEEKLY_SEND_ENABLED=false`). A send is queued on the `database` queue and, with no `queue:work` process, would stay `pending` forever. The Send control is hidden and the page says **Office delivery gate closed.**
- Set `BROADCAST_CONNECTION=null` in the shared production `.env` while `VITE_REALTIME_ENABLED` is `false`, before the deploy that carries this change. `scripts/deploy-production.sh` runs `config:cache` in each new release, so a release built after the edit picks it up. Editing the shared file alone does not change the active release: its cached config keeps `log` until a deploy or `php artisan config:cache` runs. With `null`, `NewCaseSubmitted` and `CaseAttentionChanged` still dispatch, but Laravel does not queue their broadcasts, so nothing accumulates in the `jobs` table. `log` does not prevent that: Laravel queues a broadcast job for every driver, `log` included, and a worker started later would flush the whole stale backlog at once. Never set `reverb` without the `REVERB_*` keys and a running Reverb server; the app fails at boot (`routes/channels.php`), and a `config:cache` in the live release would take the site down.

Enabling the send flag requires a supervised `php artisan queue:work` and working SMTP first.

Local proof without real mail: `cd api && php artisan test --filter=WeeklyReportMailEndToEndTest` queues a report and delivers it through the real `weekly_smtp` transport (TLS verified) into `api/tests/Support/fake_smtp_mailbox.py`, a local mailbox that relays nothing. It needs `openssl` and `python3` on the machine and skips itself when either is missing. For production variable names and ordered steps, see the "Production checklist: enable weekly report email" GitHub issue.

## Aerial analysis needs Python and the model staged first
`CANEGUARD_AERIAL_ANALYSIS_ENABLED` defaults to `false` in code and `api/.env.example`; leave it `false` until the staging and identity checks below are complete. With it on and anything missing, uploads answer `503` ("The aerial check is unavailable right now"). Releases ship `aerial-inference/segment.py` and `model.onnx.sha256` but never `model.onnx` or weights (they are too large for git); the operator stages the model by hand. Torch is not installed on the server.

Staging checklist (as `deploy`, outside the release directories, except for the administrator verification in step 6):
1. Python >= 3.11: `python3 --version`. Install it first if older.
2. Create a venv: `python3 -m venv /var/www/caneguard/shared/aerial-venv`.
3. Install the pinned runtime packages (numpy, onnxruntime, Pillow) from `aerial-inference/requirements.txt` in the revision you are deploying. For example, if the active release has the same requirements: `/var/www/caneguard/shared/aerial-venv/bin/pip install -r /var/www/caneguard/current/aerial-inference/requirements.txt`.
4. Copy `model.onnx` (exported by `aerial-inference/export_onnx.py` on a dev machine) to `/var/www/caneguard/shared/aerial/model.onnx`, then verify it: `sha256sum /var/www/caneguard/shared/aerial/model.onnx` must equal the hash in `aerial-inference/model.onnx.sha256` (or `CANEGUARD_AERIAL_WEIGHTS_SHA256` if set). The file must be readable by `deploy` and `www-data`.
5. Ensure `/var/www/caneguard/shared/api/storage/app/private/aerial` exists and is writable by `www-data` (it holds uploaded photos and masks, and is covered by the existing storage permissions).
6. Before enabling the flag, an administrator (`ubuntu`) must ensure `www-data` can traverse every ancestor of the venv, interpreter (including symlink targets), model and storage, execute the interpreter, read the venv's site-packages and model, and write/search the storage directory. For example, after reviewing existing ACLs and masks, grant read/traverse access to the staged trees with `setfacl -R -m u:www-data:rX /var/www/caneguard/shared/aerial-venv /var/www/caneguard/shared/aerial` (or equivalent); provision any missing ancestor or interpreter-target permissions separately. Then, as `ubuntu`, verify the actual FPM identity:
   ```sh
   sudo -u www-data /var/www/caneguard/shared/aerial-venv/bin/python -c 'import numpy, onnxruntime, PIL'
   sudo -u www-data test -r /var/www/caneguard/shared/aerial/model.onnx
   sudo -u www-data test -w /var/www/caneguard/shared/api/storage/app/private/aerial
   sudo -u www-data test -x /var/www/caneguard/shared/api/storage/app/private/aerial
   ```
   Every command must succeed; use the actual configured paths if they differ. Repeat the permission provisioning and verification after replacing or modifying the venv, packages, model, or their paths.
7. Only then set, in the shared `.env` (`shared/api/.env`), and no earlier. This flag only marks the check as **installed**; it does not turn it on. The Admin switch is stored in the database and survives this flag being unset: if you roll back by unsetting the flag while the switch is On, setting it again on a later deploy turns the check back on immediately. To keep the check dark after a rollback, turn it Off in Admin Settings before unsetting the flag:
   ```
   CANEGUARD_AERIAL_ANALYSIS_ENABLED=true
   CANEGUARD_AERIAL_PYTHON=/var/www/caneguard/shared/aerial-venv/bin/python
   CANEGUARD_AERIAL_MODEL_PATH=/var/www/caneguard/shared/aerial/model.onnx
   ```
   Use an absolute interpreter path: PHP-FPM does not inherit your shell's venv.
8. Run a new deploy. `scripts/preflight-aerial.php` runs after `config:cache` and before migrations and activation. It prints `PASS ...` per check and `PASS aerial preflight`, or fails the deploy listing each missing piece (Python version, packages, model file or SHA-256, storage, smoke inference). With the flag `false` it prints one line and changes nothing.
9. After activation, an Admin opens Admin Settings, finds **Aerial canopy check** (it reads **Not installed on this server** while the flag is off) and chooses **Turn on aerial check**. The switch is stored in the `feature_switches` table and defaults to off. The check is live only when both the install flag and the Admin switch are on.
10. Confirm in the office UI that an aerial photo uploads on a test case and shows canopy shares.

Limits: the aerial preflight runs as `deploy`, not `www-data`, so its Python, package, model, storage and inference checks only prove deploy access. Step 6 verifies the FPM identity's staged dependencies and storage permissions; step 9 turns the switch on, and step 10 checks the live upload path. The model is not part of the release archive, so a deploy never replaces it; to change the model, stage the new file and its pinned SHA-256 together and redeploy.

Rollback: an Admin chooses **Turn off aerial check** in Admin Settings (no deploy). New requests get `404` at once, and an upload already in progress is refused before it saves anything. To remove the install as well, set `CANEGUARD_AERIAL_ANALYSIS_ENABLED=false` in the shared `.env` and deploy again (or run `php artisan config:cache` in the active release). The routes then return `404` and cases carry no aerial field; stored photos and results are retained. The preflight runs as a no-op while the flag is off. Staging files can stay in place.

## Maps need the MapTiler key at build time and the CSP allowlist

1. Create a MapTiler key restricted to the `https://caneguard.online` origin. A `VITE_*` value is public in the shipped bundle, so the origin restriction is the real protection.
2. Store it as the GitHub Actions secret `CANEGUARD_MAPTILER_KEY`. The deploy workflow passes it to the React build as `VITE_MAPTILER_KEY` and fails the build step while the secret is blank. A nonblank key that is revoked or used from another origin still builds, so step 5 is the check that maps actually render.
3. Basemap style, tile and glyph requests go from the browser to MapTiler, so MapTiler receives the approximate area and zoom of the locations on screen (for example a filtered report's coordinates on the validation map, or field bounds on the boundaries map). The captain allows these location-derived requests.
4. The map worker is bundled as a same-origin asset. Each map module (`src/lib/mapLibreWorker.ts`, imported by the boundaries, dashboard location and field validation maps) registers it when it loads, so the sign-in screen does not load MapLibre. The SPA shell CSP allows `https://api.maptiler.com` for `connect-src` only, plus `blob:` images and `worker-src 'self'`. Report documents and other HTML get none of these. Nginx must not add its own stricter CSP to the shell.
5. After a deploy, open the Map page signed in: tiles should draw and the browser console should show no CSP violations.

### Mobile manual-map tile proxy (`EXPO_PUBLIC_MAP_TILE_PROXY_URL`)
The proxy lives in this API: `GET /api/v1/mobile/map-tiles/{z}/{x}/{y}.png` (zoom 11–18, mobile token with `report:status`), fetching from `tile.openstreetmap.org` and caching for a day. The value for the mobile production environment is `EXPO_PUBLIC_MAP_TILE_PROXY_URL=https://caneguard.online/api/v1/mobile/map-tiles/{z}/{x}/{y}.png`; it must match `EXPO_PUBLIC_API_BASE_URL`'s origin. This runbook does not set it. The Mobile release owner sets it after confirming the proxy:
- the upstream answers: `curl -sS -A 'CaneGuard-MapTileProxy/1.0' -o /dev/null -w '%{http_code} %{content_type}\n' https://tile.openstreetmap.org/11/1676/898.png` prints `200 image/png`;
- the route is live on production: the same path without a token on `https://caneguard.online` answers `401`, not `404`;
- one cold authenticated fetch with a real mobile token, through production, returns `200 image/png` and its body decodes as an image. The proxy caches for a day, so only a request the cache has not answered proves the production path. Automation does not run this check; it needs a production credential.

## Go-live bootstrap
Put these in the GitHub `production` environment secret `CANEGUARD_PRODUCTION_ENV`, which holds the complete shared `.env` (`shared/api/.env`). Then run **Configure production environment (manual)** from Actions with `configure-caneguard`. It installs the file on the server without any terminal step. Required for go-live:
```
CANEGUARD_PILOT_DISTRICT_CODE=<district code>
CANEGUARD_PILOT_DISTRICT_NAME=<display name>
CANEGUARD_BOOTSTRAP_ADMIN_EMAIL=<first administrator email>
MAIL_MAILER=smtp   # plus MAIL_HOST, MAIL_PORT, MAIL_USERNAME and MAIL_PASSWORD (the template lists them). Only an smtp mailer can send the first invitation, and the relay must be encrypted: MAIL_SCHEME=smtps, or STARTTLS required by MAIL_REQUIRE_TLS=true (the default). Log, array and failover mailers, and plaintext relays off this machine, fail the deploy before the account is created. A plaintext relay on 127.0.0.1 or localhost is the only exception, and it needs `MAIL_REQUIRE_TLS=false`. The preflight refuses an unencrypted non-local relay only when `MAIL_REQUIRE_TLS=false`. A TLS-required relay that cannot upgrade to TLS fails after the administrator account is created and kept, and the next deploy sends the link again.
```
Then run the deploy workflow. After `migrate --force`, `caneguard:bootstrap`:
- fails the deploy when the district code or name is blank; it creates the district when missing, and an existing district is never renamed;
- once an active administrator exists, leaves the admin variables alone, including a malformed admin email, and sends no further emails. To reissue the link, use Forgot password;
- otherwise, when `CANEGUARD_BOOTSTRAP_ADMIN_EMAIL` is set, fails the deploy if the address is invalid, and fails the deploy when it already belongs to another account. Set it to an unused address and deploy again;
- otherwise creates the administrator (display name `CaneGuard Administrator`) and then emails a set-password link. No password goes in env. If the email cannot be sent, the deploy fails but the pending account is kept; the next deploy emails the link again until an invitation is recorded. A deploy retried within a minute of a link being issued also fails, asking for another deploy after that minute. Changing `CANEGUARD_BOOTSTRAP_ADMIN_EMAIL` before that administrator sets a password supersedes the earlier invitation, even when the mail check then fails: the earlier address is deactivated, its reset links are deleted, and an `account_status_change` audit row records it, so only the new address can onboard. The earlier address cannot be verified by link, requested again through Forgot password, or used to set a password; this is recorded on the account itself (`bootstrap_superseded_at`), so it holds after audit retention prunes the old invitation rows. Setting the old address again then fails the deploy as an existing account;
- writes security audit rows (`bootstrap_district_created`, `account_created`, `account_invite_sent`) for everything it creates. While the first administrator is pending (active and not yet verified), its successful `account_created` and `account_invite_sent` rows are exempt from the security-audit retention prune, because a later deploy relies on them to recover it. Once it is verified or superseded they age out normally.

If the mail server accepts the link but the invitation record cannot be written, the outcome is indeterminate: the account stays pending, and a later deploy sends the link again if the administrator has not yet set a password. This is the accepted policy; no outbox is kept.

Admins and reviewers need no district. A district is required only to create a field reporter through the Accounts page.

Still by hand: PHP-FPM and nginx upload/body limits, which need root. The host must also have the `cron` package and an enabled, running `cron` service, so the scheduler survives a reboot. The deploy checks both and does not install or start them; as `ubuntu`, run `sudo apt-get install -y cron` and `sudo systemctl enable --now cron`.

## Scheduler for reminders, follow-up due notifications and pruning
The saved reminder day and time (Asia/Manila) only fire if the Laravel scheduler runs. The deploy script installs this entry in the `deploy` user's crontab (marked `# caneguard-scheduler`, pointing at the stable `current` symlink, with the absolute `php` path that account resolves). It replaces any earlier entry for that symlink, including the unmarked line from the previous runbook, and keeps unrelated jobs. Each deploy records a `scheduler_cron_observed` audit row showing that the entry was present in the crontab at that deploy; the row does not record when the entry was installed. No manual crontab step is needed:

```
* * * * * cd /var/www/caneguard/current/api && php artisan schedule:run >> /dev/null 2>&1 # caneguard-scheduler
```

Two prune commands also run from the scheduler, daily in Asia/Manila: `auth:prune-security-audits` at 02:00 (retention `CANEGUARD_SECURITY_AUDIT_RETENTION_DAYS`) and `caneguard:prune-api-tokens` at 02:30, which removes API tokens expired for more than 24 hours. Each successful run writes a `prune_run` audit row.

`reports:send-weekly-reminders` then runs every 15 minutes. From the saved slot until the end of that Manila day, if the previous ISO week has no approved current version, it creates one in-app notification per active Admin and Reviewer, once per week. It never prepares, approves or sends, and needs no queue worker or mail. Without the cron entry, saved reminders silently never fire.

`notifications:derive-follow-up-due` runs on the same 15-minute schedule. It creates the overdue follow-up items Mobile renders; without the cron entry, no follow-up due notification is ever created and reading the feed never makes one appear.

## Explicit exclusions
No Android app build, Mobile integration, SRA roster provisioning, seeding, Reverb launch, or database reset. SMTP is needed only for the first administrator's invitation in the go-live bootstrap above. District and first-admin creation happen only through `caneguard:bootstrap` above.
