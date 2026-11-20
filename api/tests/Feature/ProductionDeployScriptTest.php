<?php

namespace Tests\Feature;

use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * Runs the real production shell scripts with fake host tools (php, composer,
 * curl, crontab, ACL tools) against a temporary deploy root, then checks what
 * they did: step order, the activated release, and the deploy user's crontab.
 */
class ProductionDeployScriptTest extends TestCase
{
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
        file_put_contents($this->crontab, "MAILTO=ops@example.test\n30 4 * * * /usr/local/bin/backup.sh\n* * * * * cd {$this->root}/current/api && php artisan schedule:run >> /dev/null 2>&1\n");
        $first = 'release-1-'.str_repeat('b', 40);
        $second = 'release-2-'.str_repeat('c', 40);

        $this->deploy($first);
        $this->deploy($second);

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
            "* * * * * cd {$this->root}/current/api && {$this->bin}/php artisan schedule:run >> /dev/null 2>&1 # caneguard-scheduler",
        ], $this->crontabLines());
        $this->assertSame(1, count(array_filter($lines, fn (string $line) => $line === 'artisan caneguard:record-scheduler-install --no-interaction')));
    }

    public function test_configuration_install_replaces_the_shared_env_and_removes_the_upload(): void
    {
        $upload = $this->root.'/releases/.env-4242';
        file_put_contents($upload, "APP_KEY=base64:example\n");

        $process = $this->runScript('scripts/install-production-env.sh', ['4242']);

        $this->assertTrue($process->isSuccessful(), $process->getErrorOutput());
        $this->assertSame("APP_KEY=base64:example\n", file_get_contents($this->root.'/shared/api/.env'));
        $this->assertSame(0640, fileperms($this->root.'/shared/api/.env') & 0777);
        $this->assertFileDoesNotExist($upload);
    }

    public function test_configuration_install_without_an_upload_keeps_the_existing_env(): void
    {
        $process = $this->runScript('scripts/install-production-env.sh', ['5151']);

        $this->assertFalse($process->isSuccessful());
        $this->assertSame("APP_ENV=production\n", file_get_contents($this->root.'/shared/api/.env'));
    }

    private function deploy(string $releaseId): void
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

        $process = $this->runScript('scripts/deploy-production.sh', [$releaseId, hash_file('sha256', $archive)]);

        $this->assertTrue($process->isSuccessful(), $process->getOutput().$process->getErrorOutput());
    }

    /** @param  list<string>  $arguments */
    private function runScript(string $relativePath, array $arguments): Process
    {
        $process = new Process(
            ['bash', base_path('../'.$relativePath), ...$arguments],
            null,
            [
                'PATH' => $this->bin.':'.getenv('PATH'),
                'CANEGUARD_DEPLOY_ROOT' => $this->root,
                'CANEGUARD_TEST_LOG' => $this->log,
                'CANEGUARD_TEST_CRONTAB' => $this->crontab,
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
              echo "bootstrap saw current=$(readlink "$CANEGUARD_DEPLOY_ROOT/current")" >> "$CANEGUARD_TEST_LOG"
            fi
            SH);
        $this->writeTool('composer', 'exit 0');
        $this->writeTool('setfacl', 'exit 0');
        $this->writeTool('getfacl', 'exit 0');
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
              [[ -f "$CANEGUARD_TEST_CRONTAB" ]] || exit 1
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
