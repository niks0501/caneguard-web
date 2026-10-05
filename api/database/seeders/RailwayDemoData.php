<?php

namespace Database\Seeders;

use Ramsey\Uuid\Uuid;

/** Isolate approved deployment fixtures from all pre-existing development/history rows and files. */
final class RailwayDemoData
{
    public const APPROVAL = 'nasugbu-dashboard-20261006';

    public const PREFIX = 'DEMO-NAS-20261006-';

    public static function managerName(): string
    {
        // Approved personal identity comes from runtime config, never source control.
        return trim((string) config('caneguard.railway_demo_manager_name'));
    }

    public static function active(): bool
    {
        // Internal, temporary override set only by RailwayDemoSeeder after its gates pass.
        return config('caneguard.seeders.railway_demo_namespace') === self::APPROVAL;
    }

    public static function reference(string $reference): string
    {
        return self::active() ? self::PREFIX.$reference : $reference;
    }

    public static function path(string $path): string
    {
        return self::active() ? 'railway-demo/'.self::APPROVAL.'/'.$path : $path;
    }

    public static function uuid(string $identity, string $original): string
    {
        return self::active() ? Uuid::uuid5(Uuid::NAMESPACE_URL, 'caneguard/'.self::APPROVAL.'/'.$identity)->toString() : $original;
    }

    public static function identities(string $reference, array $attributes): array
    {
        foreach (['uuid', 'client_uuid', 'scan_record_client_uuid'] as $field) {
            if (isset($attributes[$field])) {
                $attributes[$field] = self::uuid($field.'/'.$reference, $attributes[$field]);
            }
        }

        return $attributes;
    }
}
