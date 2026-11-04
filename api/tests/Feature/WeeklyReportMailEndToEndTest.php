<?php

namespace Tests\Feature;

use App\Actions\Reports\DistrictReportWorkflow;
use App\Models\DistrictGrant;
use App\Models\DistrictRecipientSet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Real transport, fake mailbox: the approved weekly report travels through the database queue and the
 * TLS-required `weekly_smtp` mailer into a local STARTTLS server that stores, and relays, nothing.
 */
class WeeklyReportMailEndToEndTest extends TestCase
{
    use RefreshDatabase;

    /** @var resource|null */
    private $server = null;

    private string $dir = '';

    private ?string $previousCaFile = null;

    protected function tearDown(): void
    {
        if (is_resource($this->server)) {
            proc_terminate($this->server);
            proc_close($this->server);
        }
        putenv($this->previousCaFile === null ? 'SSL_CERT_FILE' : 'SSL_CERT_FILE='.$this->previousCaFile);
        if ($this->dir !== '') {
            array_map('unlink', glob($this->dir.'/*') ?: []);
            @rmdir($this->dir);
        }
        parent::tearDown();
    }

    public function test_queued_report_reaches_fake_mailbox_over_verified_tls_with_approved_pdf(): void
    {
        $this->startFakeMailbox();
        config(['caneguard.weekly_send_enabled' => true]);

        $district = $this->pilotDistrict();
        $officer = User::factory()->admin()->inDistrict($district)->create();
        foreach (['report:approve', 'report:send'] as $ability) {
            DistrictGrant::query()->create(['user_id' => $officer->id, 'district_id' => $district->id, 'ability' => $ability]);
        }
        DistrictRecipientSet::query()->create(['district_id' => $district->id, 'recipients' => ['dummy@example.test'], 'office_reference' => 'synthetic-test-contract']);
        $workflow = app(DistrictReportWorkflow::class);
        $version = $workflow->prepare($officer, '2026-W40');
        $version = $workflow->approve($officer, $version, $version->content_hash);
        $intent = $workflow->requestSend($officer, $version, $version->content_hash, (string) Str::uuid());

        // Queued, not sent inline: the intent waits on the database queue until a worker runs.
        $this->assertSame('pending', $intent->fresh()->state);
        $this->assertSame(1, DB::table('jobs')->count());
        $this->assertSame([], glob($this->dir.'/*.eml'));

        Artisan::call('queue:work', ['connection' => 'database', '--once' => true, '--tries' => 1]);

        $intent = $intent->fresh();
        $this->assertSame('sent', $intent->state, (string) $intent->failure_reason);
        $this->assertNotEmpty($intent->transport_receipt);
        $messages = glob($this->dir.'/*.eml');
        $this->assertCount(1, $messages);
        $raw = file_get_contents($messages[0]);
        $this->assertStringContainsString('dummy@example.test', $raw);
        $this->assertStringContainsString('X-CaneGuard-Version: '.$version->uuid, $raw);
        $this->assertStringContainsString('application/pdf', $raw);
        $this->assertSame(0, DB::table('jobs')->count());
    }

    private function startFakeMailbox(): void
    {
        if (! function_exists('proc_open') || trim((string) shell_exec('command -v openssl python3')) === '') {
            $this->markTestSkipped('openssl and python3 are required for the fake mailbox.');
        }
        $this->dir = sys_get_temp_dir().'/caneguard-fake-mailbox-'.bin2hex(random_bytes(4));
        mkdir($this->dir, 0700);
        $cert = $this->dir.'/cert.pem';
        $key = $this->dir.'/key.pem';
        exec(sprintf('openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -addext subjectAltName=DNS:localhost -keyout %s -out %s 2>&1',
            escapeshellarg($key), escapeshellarg($cert)), $out, $code);
        $this->assertSame(0, $code, implode("\n", $out));

        $probe = stream_socket_server('tcp://127.0.0.1:0');
        $port = (int) substr(strrchr((string) stream_socket_get_name($probe, false), ':'), 1);
        fclose($probe);

        $this->server = proc_open(['python3', base_path('tests/Support/fake_smtp_mailbox.py'), (string) $port, $cert, $key, $this->dir],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $this->assertSame("listening\n", fgets($pipes[1]));

        // Strict verification stays on: the generated certificate is trusted explicitly, never bypassed.
        $this->previousCaFile = getenv('SSL_CERT_FILE') ?: null;
        putenv('SSL_CERT_FILE='.$cert);
        config([
            'queue.default' => 'database',
            'mail.mailers.weekly_smtp.scheme' => 'smtp',
            'mail.mailers.weekly_smtp.host' => 'localhost',
            'mail.mailers.weekly_smtp.port' => $port,
            'mail.mailers.weekly_smtp.username' => 'fake-user',
            'mail.mailers.weekly_smtp.password' => 'fake-pass',
            'mail.from.address' => 'reports@example.test',
        ]);
        app('mail.manager')->forgetMailers();
    }
}
