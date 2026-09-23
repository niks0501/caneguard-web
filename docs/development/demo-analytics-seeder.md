# Opt-in demo analytics reports

`DatabaseSeeder` keeps its existing demo-account and office-advisory behavior and does not create reports. For a local analytics/presentation dataset, run the account seed first and then explicitly select the separate 50-report seeder:

```sh
cd api
php artisan db:seed
php artisan db:seed --class='Database\Seeders\DemoAnalyticsSeeder'
```

The opt-in seeder is repeatable and refreshes only its own `BGO-DEMO50-` report rows. It creates 50 synthetic reports across the current and previous four months, using verified Nasugbu barangay reference points already maintained by `DashboardReportSeeder`. Its upload evidence follows `mobile-report-upload-v2`; its validation completions use the canonical `follow_up_outcome` enum.

Do not add `DemoAnalyticsSeeder` to `DatabaseSeeder`: the default seed intentionally remains free of report records.
