<?php

namespace Tests;

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    private static ?string $testStoragePath = null;

    public function createApplication(): Application
    {
        $storagePath = self::$testStoragePath ??= sprintf(
            '%s/caneguard-web-tests-%s-%d',
            sys_get_temp_dir(),
            function_exists('posix_geteuid') ? posix_geteuid() : get_current_user(),
            getmypid(),
        );

        $_ENV['LARAVEL_STORAGE_PATH'] = $storagePath;
        $_SERVER['LARAVEL_STORAGE_PATH'] = $storagePath;

        $compiledViewPath = $storagePath.'/framework/views';

        if (! is_dir($compiledViewPath)) {
            mkdir($compiledViewPath, 0755, true);
        }

        return parent::createApplication();
    }
}
