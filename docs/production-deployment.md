# CaneGuard Web manual production deployment

This workflow deploys **only** the Web/Laravel application to the existing Lightsail server at https://caneguard.online. It is not triggered by pushes or pull requests. It is invoked manually on `main` with confirmation `deploy-caneguard`, and it uses the `production` GitHub environment.

## Server baseline
- `deploy` must own and write `/var/www/caneguard/releases` and the parent `/var/www/caneguard`. No sudo access is required by the workflow.
- `/var/www/caneguard/current` must be a symlink to a release directory.
- The existing persistent `/var/www/caneguard/shared/api/.env` and `shared/api/storage` must exist, have correct restrictive access, and remain outside releases.
- PHP 8.3+, Composer 2, PHP extensions, Nginx, MySQL, and DNS/HTTPS must already be operational.
- `/var/www/caneguard/current/api/public` must be the Nginx document root.
- The server's `deploy` account must have `flock`, `tar`, `sha256sum`, `curl`, `id` and PHP 8.3+ CLI with `proc_open` enabled.
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
- After migration succeeds, it atomically switches `current` to the new code and verifies HTTPS API readiness and the frontend.
- On an activation health-check failure, it restores the old code symlink. **Database migrations are not rolled back.** This is a code rollback, not a full transactional deploy.
- No `migrate:fresh`, `db:seed`, `key:generate`, or database reset runs on production.
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

## Weekly send needs operations that production does not run yet
Production currently runs no queue worker and no mail. Until both are provisioned:
- Weekly send must stay off (`CANEGUARD_WEEKLY_SEND_ENABLED=false`). A send is queued on the `database` queue and, with no `queue:work` process, would stay `pending` forever. The Send control is hidden and the page says **Office delivery gate closed.**
- Keep `BROADCAST_CONNECTION=log` in the shared production `.env` while `VITE_REALTIME_ENABLED` is `false`. Queued broadcast events otherwise accumulate unprocessed in the `jobs` table.

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
7. Only then set, in the shared `.env` (`shared/api/.env`), and no earlier:
   ```
   CANEGUARD_AERIAL_ANALYSIS_ENABLED=true
   CANEGUARD_AERIAL_PYTHON=/var/www/caneguard/shared/aerial-venv/bin/python
   CANEGUARD_AERIAL_MODEL_PATH=/var/www/caneguard/shared/aerial/model.onnx
   ```
   Use an absolute interpreter path: PHP-FPM does not inherit your shell's venv.
8. Run a new deploy. `scripts/preflight-aerial.php` runs after `config:cache` and before migrations and activation. It prints `PASS ...` per check and `PASS aerial preflight`, or fails the deploy listing each missing piece (Python version, packages, model file or SHA-256, storage, smoke inference). With the flag `false` it prints one line and changes nothing.
9. After activation, confirm in the office UI that an aerial photo uploads on a test case and shows canopy shares.

Limits: the aerial preflight runs as `deploy`, not `www-data`, so its Python, package, model, storage and inference checks only prove deploy access. Step 6 verifies the FPM identity's staged dependencies and storage permissions; step 9 checks the live upload path. The model is not part of the release archive, so a deploy never replaces it; to change the model, stage the new file and its pinned SHA-256 together and redeploy.

Rollback: set `CANEGUARD_AERIAL_ANALYSIS_ENABLED=false` in the shared `.env` and deploy again (or run `php artisan config:cache` in the active release). The routes then return `404` and cases carry no aerial field; stored photos and results are retained. The preflight runs as a no-op while the flag is off. Staging files can stay in place.

## Scheduler for reminders and follow-up due notifications
The saved reminder day and time (Asia/Manila) only fire if the Laravel scheduler runs. Add one cron entry for the application user, from the `api` directory of the active release:

```
* * * * * cd /path/to/current/api && php artisan schedule:run >> /dev/null 2>&1
```

`reports:send-weekly-reminders` then runs every 15 minutes. From the saved slot until the end of that Manila day, if the previous ISO week has no approved current version, it creates one in-app notification per active Admin and Reviewer, once per week. It never prepares, approves or sends, and needs no queue worker or mail. Without the cron entry, saved reminders silently never fire.

`notifications:derive-follow-up-due` runs on the same 15-minute schedule. It creates the overdue follow-up items Mobile renders; without the cron entry, no follow-up due notification is ever created and reading the feed never makes one appear.

## Explicit exclusions
No Android app build, Mobile integration, SRA roster provisioning, district changes, SMTP setup, seeding, Reverb launch, or database reset.
