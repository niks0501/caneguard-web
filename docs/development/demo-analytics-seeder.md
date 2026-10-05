# Demo analytics reports

`DatabaseSeeder` seeds the complete local demo: accounts, the configured pilot district and office memberships, advisory catalogs, reports, dashboard records, and analytics records. Run one command against a local development database, never production:

```sh
cd api
php artisan db:seed
```

The analytics seeder is repeatable and refreshes only its own `BGO-DEMO50-` report rows. It creates 50 synthetic reports across the current and previous four months, using verified Nasugbu barangay reference points already maintained by `DashboardReportSeeder`. Its upload evidence follows `mobile-report-upload-v2`; its validation completions use the canonical `follow_up_outcome` enum.

After the full seed has provided its dependencies, rerun just the analytics dataset with:

```sh
php artisan db:seed --class='Database\Seeders\DemoAnalyticsSeeder'
```

Reseeding updates stable fixture keys without deleting unrelated rows or duplicating reports, evidence, assignments, or completions.
