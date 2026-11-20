<?php

namespace Tests\Feature;

use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * Runs the real production shell scripts with fake host tools (php, composer,
 * curl, crontab, ACL tools). The scripts address the fixed production root, so
 * each run executes a copy whose root path is rewritten to a temporary fixture.
 * The assertions check step order, the activated release, the deploy user's
 * crontab, and the audit invocations.
 */
class ProductionDeployScriptTest extends TestCase
{
    private const PRODUCTION_ROOT = '/var/www/caneguard';

    private const OLD_RELEASE = 'release-0-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    private string $root;

    private string $bin;

    private string $log;

    private string $crontab;

    protected function setUp(): void
    {
        parent::setUp();
        $this->root = realpath(sys_get_temp_dir()).'/caneguard-deploy-'.bin2hex(random_bytes(6));
        $this->bin = $this->root.'/fake-bin';
        $this->log = $this->root.'/commands.log';
        $this->crontab = $this->root.'/crontab.txt';
        mkdir($this->bin, 0777, true);
        mkdir($this->root.'/releases/'.self::OLD_RELEASE.'/api', 0777, true);
        mkdir($this->root.'/shared/api/storage', 0777, true);
        file_put_contents($this->root.'/shared/api/.env', "APP_ENV=production\n");
        symlink($this->root.'/releases/'.self::OLD_RELEASE, $this->root.'/current');
        $this->fakeTools();
    }

    protected function tearDown(): void
    {
        (new Process(['rm', '-rf', $this->root]))->run();
        parent::tearDown();
    }

    public function test_deploy_migrates_then_bootstraps_then_activates_and_keeps_one_scheduler_entry(): void
    {
        $legacy = "* * * * * cd {$this->root}/current/api && php artisan schedule:run >> /dev/null 2>&1";
        $unrelated = '15 3 * * * cd /srv/other/current/api && php artisan schedule:run >> /dev/null 2>&1';
        file_put_contents($this->crontab, "MAILTO=ops@example.test\n30 4 * * * /usr/local/bin/backup.sh\n{$unrelated}\n{$legacy}\n");
        $first = 'release-1-'.str_repeat('b', 40);
        $second = 'release-2-'.str_repeat('c', 40);
        $managed = "* * * * * cd {$this->root}/current/api && {$this->bin}/php artisan schedule:run >> /dev/null 2>&1 # caneguard-scheduler";

        $this->assertTrue($this->deploy($first)->isSuccessful());
        $this->assertTrue($this->deploy($second)->isSuccessful());

        $this->assertSame($this->root.'/releases/'.$second, readlink($this->root.'/current'));
        $lines = $this->logLines();
        $migrate = array_search('artisan migrate --force --no-interaction', $lines, true);
        $bootstrap = array_search('artisan caneguard:bootstrap --no-interaction', $lines, true);
        $this->assertNotFalse($migrate);
        $this->assertNotFalse($bootstrap);
        $this->assertLessThan($bootstrap, $migrate);
        $this->assertSame('bootstrap saw current='.$this->root.'/releases/'.self::OLD_RELEASE, $lines[$bootstrap + 1]);
        $this->assertSame([
            'MAILTO=ops@example.test',
            '30 4 * * * /usr/local/bin/backup.sh',
            $unrelated,
            $managed,
        ], $this->crontabLines());
        $this->assertSame(
            ["artisan caneguard:record-scheduler-install {$managed} --no-interaction", "artisan caneguard:record-scheduler-install {$managed} --no-interaction"],
            array_values(array_filter($lines, fn (string $line) => str_starts_with($line, 'artisan caneguard:record-scheduler-install '))),
        );
    }

    public function test_unreadable_crontab_fails_the_deploy_and_keeps_the_existing_jobs(): void
    {
        $existing = "MAILTO=ops@example.test\n30 4 * * * /usr/local/bin/backup.sh\n";
        file_put_contents($this->crontab, $existing);

        $process = $this->deploy('release-1-'.str_repeat('b', 40), ['CANEGUARD_TEST_CRONTAB_READ_FAILS' => '1']);

        $this->assertFalse($process->isSuccessful());
        $this->assertSame($existing, file_get_contents($this->crontab));
    }

    public function test_deploy_stops_before_migrations_when_the_cron_service_is_not_active(): void
    {
        $existing = "MAILTO=ops@example.test\n30 4 * * * /usr/local/bin/backup.sh\n";
        file_put_contents($this->crontab, $existing);

        $process = $this->deploy('release-1-'.str_repeat('b', 40), ['CANEGUARD_TEST_CRON_INACTIVE' => '1']);

        $this->assertFalse($process->isSuccessful());
        $this->assertSame($existing, file_get_contents($this->crontab));
        $this->assertNotContains('artisan migrate --force --no-interaction', $this->logLines());
    }

    public function test_deploy_stops_before_migrations_when_the_cron_service_is_not_enabled_for_reboot(): void
    {
        $existing = "MAILTO=ops@example.test\n30 4 * * * /usr/local/bin/backup.sh\n";
        file_put_contents($this->crontab, $existing);

        $process = $this->deploy('release-1-'.str_repeat('b', 40), ['CANEGUARD_TEST_CRON_STATE' => 'disabled']);

        $this->assertFalse($process->isSuccessful());
        $this->assertSame($existing, file_get_contents($this->crontab));
        $this->assertNotContains('artisan migrate --force --no-interaction', $this->logLines());
    }

    public function test_deploy_stops_when_cron_is_enabled_only_for_the_current_boot(): void
    {
        $existing = "MAILTO=ops@example.test\n30 4 * * * /usr/local/bin/backup.sh\n";
        file_put_contents($this->crontab, $existing);

        $process = $this->deploy('release-1-'.str_repeat('b', 40), ['CANEGUARD_TEST_CRON_STATE' => 'enabled-runtime']);

        $this->assertFalse($process->isSuccessful());
        $this->assertSame($existing, file_get_contents($this->crontab));
        $this->assertNotContains('artisan migrate --force --no-interaction', $this->logLines());
    }

    public function test_legacy_scheduler_line_with_trailing_whitespace_is_replaced_not_duplicated(): void
    {
        $legacy = "* * * * * cd {$this->root}/current/api && php artisan schedule:run >> /dev/null 2>&1 \t";
        file_put_contents($this->crontab, "{$legacy}\n");
        $managed = "* * * * * cd {$this->root}/current/api && {$this->bin}/php artisan schedule:run >> /dev/null 2>&1 # caneguard-scheduler";

        $this->assertTrue($this->deploy('release-1-'.str_repeat('b', 40))->isSuccessful());

        $this->assertSame([$managed], $this->crontabLines());
    }

    public function test_failed_crontab_rewrite_aborts_before_replacing_the_existing_jobs(): void
    {
        $existing = "MAILTO=ops@example.test\n30 4 * * * /usr/local/bin/backup.sh\n";
        file_put_contents($this->crontab, $existing);

        $process = $this->deploy('release-1-'.str_repeat('b', 40), ['CANEGUARD_TEST_AWK_FAILS' => '1']);

        $this->assertFalse($process->isSuccessful());
        $this->assertSame($existing, file_get_contents($this->crontab));
    }

    public function test_missing_scheduler_audit_is_backfilled_by_the_next_deploy(): void
    {
        $managed = "* * * * * cd {$this->root}/current/api && {$this->bin}/php artisan schedule:run >> /dev/null 2>&1 # caneguard-scheduler";

        $failed = $this->deploy('release-1-'.str_repeat('b', 40), ['CANEGUARD_TEST_FAIL_RECORD' => '1']);
        $this->assertFalse($failed->isSuccessful());
        $this->assertSame($this->root.'/releases/'.self::OLD_RELEASE, readlink($this->root.'/current'));
        $this->assertSame([$managed], $this->crontabLines());

        @unlink($this->log);
        $this->assertTrue($this->deploy('release-2-'.str_repeat('c', 40))->isSuccessful());
        $this->assertContains("artisan caneguard:record-scheduler-install {$managed} --no-interaction", $this->logLines());
    }

    public function test_configuration_install_replaces_the_shared_env_with_owner_only_mode_and_removes_the_upload(): void
    {
        file_put_contents($this->root.'/releases/.env-4242-1', "APP_KEY=base64:example\n");

        $process = $this->runScript('scripts/install-production-env.sh', ['4242-1']);

        $this->assertTrue($process->isSuccessful(), $process->getErrorOutput());
        $this->assertSame("APP_KEY=base64:example\n", file_get_contents($this->root.'/shared/api/.env'));
        $this->assertSame(0600, fileperms($this->root.'/shared/api/.env') & 0777);
        $this->assertFileDoesNotExist($this->root.'/releases/.env-4242-1');
    }

    public function test_configuration_install_grants_php_fpm_read_through_acl_without_group_or_other_access(): void
    {
        $setfacl = trim((string) shell_exec('command -v setfacl'));
        $getfacl = trim((string) shell_exec('command -v getfacl'));
        if ($setfacl === '' || $getfacl === '' || posix_getpwnam('www-data') === false) {
            $this->markTestSkipped('Needs the acl tools and the www-data account.');
        }
        file_put_contents($this->root.'/releases/.env-6161-1', "APP_KEY=base64:example\n");
        $script = $this->root.'/install-production-env.sh';
        file_put_contents($script, str_replace(
            self::PRODUCTION_ROOT,
            $this->root,
            (string) file_get_contents(base_path('../scripts/install-production-env.sh')),
        ));

        $install = new Process(['bash', $script, '6161-1'], null, ['PATH' => getenv('PATH')]);
        $install->run();
        $this->assertTrue($install->isSuccessful(), $install->getErrorOutput());

        $listing = (new Process([$getfacl, '--absolute-names', '--omit-header', $this->root.'/shared/api/.env']))->mustRun()->getOutput();
        $entries = array_map('trim', explode("\n", trim($listing)));
        $this->assertContains('user:www-data:r--', $entries);
        $this->assertContains('group::---', $entries);
        $this->assertContains('other::---', $entries);
    }

    public function test_failed_configuration_install_keeps_the_existing_env_and_removes_the_upload(): void
    {
        file_put_contents($this->root.'/releases/.env-5151-1', '');

        $process = $this->runScript('scripts/install-production-env.sh', ['5151-1']);

        $this->assertFalse($process->isSuccessful());
        $this->assertSame("APP_ENV=production\n", file_get_contents($this->root.'/shared/api/.env'));
        $this->assertFileDoesNotExist($this->root.'/releases/.env-5151-1');
    }

    private function deploy(string $releaseId, array $env = []): Process
    {
        $staging = $this->root.'/staging-'.$releaseId;
        mkdir($staging.'/api/public', 0777, true);
        mkdir($staging.'/scripts', 0777, true);
        file_put_contents($staging.'/api/public/index.php', "<?php\n");
        file_put_contents($staging.'/api/public/index.html', "<html></html>\n");
        file_put_contents($staging.'/scripts/verify-release-access.php', "<?php\n");
        file_put_contents($staging.'/scripts/preflight-aerial.php', "<?php\n");
        $archive = $this->root.'/releases/.upload-'.$releaseId.'.tar.gz';
        (new Process(['tar', '-czf', $archive, '-C', $staging, '.']))->mustRun();

        return $this->runScript('scripts/deploy-production.sh', [$releaseId, hash_file('sha256', $archive)], $env);
    }

    /**
     * @param  list<string>  $arguments
     * @param  array<string, string>  $env
     */
    private function runScript(string $relativePath, array $arguments, array $env = []): Process
    {
        $name = basename($relativePath);
        $script = $this->root.'/'.$name;
        file_put_contents($script, str_replace(
            self::PRODUCTION_ROOT,
            $this->root,
            (string) file_get_contents(base_path('../'.$relativePath)),
        ));

        $process = new Process(
            ['bash', $script, ...$arguments],
            null,
            [
                'PATH' => $this->bin.':'.getenv('PATH'),
                'CANEGUARD_TEST_ROOT' => $this->root,
                'CANEGUARD_TEST_LOG' => $this->log,
                'CANEGUARD_TEST_CRONTAB' => $this->crontab,
                ...$env,
            ],
        );
        $process->run();

        return $process;
    }

    /** @return list<string> */
    private function logLines(): array
    {
        return is_file($this->log) ? array_values(array_filter(explode("\n", (string) file_get_contents($this->log)))) : [];
    }

    /** @return list<string> */
    private function crontabLines(): array
    {
        return array_values(array_filter(explode("\n", (string) file_get_contents($this->crontab))));
    }

    private function fakeTools(): void
    {
        $this->writeTool('php', <<<'SH'
            echo "$*" >> "$CANEGUARD_TEST_LOG"
            if [[ "$1 $2" == "artisan caneguard:bootstrap" ]]; then
              echo "bootstrap saw current=$(readlink "$CANEGUARD_TEST_ROOT/current")" >> "$CANEGUARD_TEST_LOG"
            fi
            if [[ "$2" == "caneguard:record-scheduler-install" && -n "${CANEGUARD_TEST_FAIL_RECORD:-}" ]]; then
              exit 1
            fi
            SH);
        $this->writeTool('composer', 'exit 0');
        $this->writeTool('setfacl', 'echo "setfacl $*" >> "$CANEGUARD_TEST_LOG"');
        $this->writeTool('getfacl', 'exit 0');
        $this->writeTool('systemctl', <<<'SH'
            if [[ "$1" == "is-enabled" ]]; then
              state="${CANEGUARD_TEST_CRON_STATE:-enabled}"
              echo "$state"
              [[ "$state" == enabled ]]
            fi
            if [[ "$1" == "is-active" && -n "${CANEGUARD_TEST_CRON_INACTIVE:-}" ]]; then exit 3; fi
            SH);
        $this->writeTool('awk', 'if [[ -n "${CANEGUARD_TEST_AWK_FAILS:-}" ]]; then echo "awk: failed" >&2; exit 2; fi'."\n".'exec '.escapeshellarg(trim((string) shell_exec('command -v awk'))).' "$@"');
        $this->writeTool('curl', <<<'SH'
            url="${@: -1}"
            if [[ "$url" == */api/health ]]; then
              echo '{"data":{"status":"ok","checks":{"database":"ready","storage":"ready"}}}'
            else
              echo '<html></html>'
            fi
            SH);
        $this->writeTool('crontab', <<<'SH'
            if [[ "$1" == "-l" ]]; then
              if [[ -n "${CANEGUARD_TEST_CRONTAB_READ_FAILS:-}" ]]; then
                echo "crontab: permission denied" >&2
                exit 1
              fi
              if [[ ! -f "$CANEGUARD_TEST_CRONTAB" ]]; then
                echo "no crontab for deploy" >&2
                exit 1
              fi
              cat "$CANEGUARD_TEST_CRONTAB"
              exit 0
            fi
            cat > "$CANEGUARD_TEST_CRONTAB"
            SH);
    }

    private function writeTool(string $name, string $body): void
    {
        $path = $this->bin.'/'.$name;
        file_put_contents($path, "#!/usr/bin/env bash\n".$body."\n");
        chmod($path, 0755);
    }
}
