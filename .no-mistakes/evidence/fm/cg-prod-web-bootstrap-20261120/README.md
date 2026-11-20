Production go-live deploy path - live acceptance run (b0b4001)

Revision: b0b4001dbb3835377f5028dd23a0f290aaa70d2c (branch fm/cg-prod-web-bootstrap-20261120)
Host: WSL2 Linux, PHP 8.3.6, Laravel 13.42.0, Composer 2.10.3

Environment driven (all disposable):
- Three throwaway SQLite databases under /tmp/lv (db.sqlite, db2.sqlite, db3.sqlite) created by the
  real `php artisan migrate --force`; no shared or production database was touched.
- A local plaintext SMTP sink (/tmp/lv/smtp.py, 127.0.0.1:2626) so the real Symfony mail transport
  delivered the actual set-password messages, which were inspected byte for byte.
- The real API served by `php artisan serve --host 127.0.0.1 --port 8123` for the HTTP steps
  (bootstrap invite redemption, sign-in, superseded-link refusal, account creation API).
- The real scripts/deploy-production.sh driven against a disposable release root (/tmp/lv/deploy)
  with host tools that this machine does not have (crontab, systemctl, setfacl, getfacl, php,
  composer, curl) provided as logging stand-ins. Only the fixed production root path was rewritten
  in the executed copy; deploy logic, cron replacement and step order are the committed script.
- The real scripts/install-production-env.sh driven through a `/bin/sh` login shell exactly as the
  configure workflow invokes it (`bash -c "$(printf %s '<base64>' | base64 -d)"`, env on stdin).

Scenarios and where their evidence lives in this directory:
1. First deploy bootstrap creates the pilot district, creates the first administrator and delivers
   the set-password email ........ production-template-bootstrap.txt, bootstrap-invite-redemption.txt,
   *.eml (delivered messages)
2. Re-running the deploy bootstrap changes nothing and sends no second email
   ........ throttle-and-mail-refusal.txt (first section) plus the same transcripts' state dumps
3. The emailed link sets the administrator password and sign-in works
   ........ bootstrap-invite-redemption.txt
4. Changing CANEGUARD_BOOTSTRAP_ADMIN_EMAIL supersedes the earlier pending administrator: original
   link refused, no replacement link issued, status-change audit written
   ........ bootstrap-supersession-and-active-admin.txt
5. An active administrator stops further admin provisioning
   ........ bootstrap-supersession-and-active-admin.txt (last section)
6. A non-deliverable mail configuration is refused before any account is created
   ........ throttle-and-mail-refusal.txt (run A)
7. A mistyped mailer name is refused without a stack trace and without rolling back supersession
   ........ covered by scenario 4's transaction state plus the same refusal path; the refusal text and
   the committed supersession are in bootstrap-supersession-and-active-admin.txt
8. A retry inside the reset throttle is reported as its own outcome, and a later retry succeeds
   ........ throttle-and-mail-refusal.txt (runs B-F)
9. A configured reset URL that already carries ?token= yields exactly one authoritative token and
   keeps unrelated parameters ........ reset-url-shadowed-token.txt
10. The production env template, with only its placeholders filled, drives the bootstrap end to end
   ........ production-template-bootstrap.txt
11. The deploy installs exactly one scheduler cron entry, replaces every earlier variant, keeps
    unrelated jobs, and refuses to deploy when the cron service is down
    ........ deploy-script-scheduler-cron.txt
12. The scheduler-install audit row is written only when the entry is really in the crontab
    ........ record-scheduler-install.txt
13. The two prune commands are scheduled and, when run, prune and record their audit rows
    ........ scheduler-prunes.txt
14. An admin creates a review-only web account with no pilot district while a field reporter is
    still refused ........ districtless-account-creation.txt
15. The shared production .env is installed atomically from a streamed stdin over a non-bash login
    shell, mode 0600, and an incomplete stream is rejected
    ........ install-production-env.txt
