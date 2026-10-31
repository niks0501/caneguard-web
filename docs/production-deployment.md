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

## Explicit exclusions
No Android app build, Mobile integration, SRA roster provisioning, district changes, SMTP setup, seeding, Reverb launch, or database reset.
