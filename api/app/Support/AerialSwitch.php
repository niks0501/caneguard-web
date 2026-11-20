<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * The aerial canopy check is live only when the server has it installed
 * (CANEGUARD_AERIAL_ANALYSIS_ENABLED, the capability gate) and an Admin has
 * switched it on. No saved switch means off.
 */
final class AerialSwitch
{
    public const NAME = 'aerial_analysis';

    public static function installed(): bool
    {
        return config('caneguard.aerial.enabled') === true;
    }

    public static function switchedOn(): bool
    {
        return (bool) DB::table('feature_switches')->where('name', self::NAME)->value('enabled');
    }

    public static function enabled(): bool
    {
        return self::installed() && self::switchedOn();
    }

    /** @return list<string> */
    public static function relations(): array
    {
        return self::enabled() ? ['aerialAnalyses.uploader', 'aerialAnalyses.report'] : [];
    }
}
