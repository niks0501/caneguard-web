<?php

namespace Tests\Support;

/** Points a configured SMTP mailer at tests/Support/fake_smtp_mailbox.py, a local STARTTLS mailbox that stores, and relays, nothing. */
trait FakeSmtpMailbox
{
    /** @var resource|null */
    private $fakeMailboxProcess = null;

    private string $fakeMailboxDir = '';

    private ?string $previousCaFile = null;

    private function stopFakeMailbox(): void
    {
        if (is_resource($this->fakeMailboxProcess)) {
            proc_terminate($this->fakeMailboxProcess);
            proc_close($this->fakeMailboxProcess);
        }
        putenv($this->previousCaFile === null ? 'SSL_CERT_FILE' : 'SSL_CERT_FILE='.$this->previousCaFile);
        if ($this->fakeMailboxDir !== '') {
            array_map('unlink', glob($this->fakeMailboxDir.'/*') ?: []);
            @rmdir($this->fakeMailboxDir);
        }
    }

    /** @return list<string> */
    private function fakeMailboxMessages(): array
    {
        return glob($this->fakeMailboxDir.'/*.eml') ?: [];
    }

    private function startFakeMailbox(string $mailer): int
    {
        if (! function_exists('proc_open') || trim((string) shell_exec('command -v openssl python3')) === '') {
            $this->markTestSkipped('openssl and python3 are required for the fake mailbox.');
        }
        $this->fakeMailboxDir = sys_get_temp_dir().'/caneguard-fake-mailbox-'.bin2hex(random_bytes(4));
        mkdir($this->fakeMailboxDir, 0700);
        $cert = $this->fakeMailboxDir.'/cert.pem';
        $key = $this->fakeMailboxDir.'/key.pem';
        exec(sprintf('openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost -addext subjectAltName=DNS:localhost -keyout %s -out %s 2>&1',
            escapeshellarg($key), escapeshellarg($cert)), $out, $code);
        $this->assertSame(0, $code, implode("\n", $out));

        $port = $this->unusedPort();
        $this->fakeMailboxProcess = proc_open(['python3', base_path('tests/Support/fake_smtp_mailbox.py'), (string) $port, $cert, $key, $this->fakeMailboxDir],
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $this->assertSame("listening\n", fgets($pipes[1]));

        // Strict verification stays on: the generated certificate is trusted explicitly, never bypassed.
        $this->previousCaFile = getenv('SSL_CERT_FILE') ?: null;
        putenv('SSL_CERT_FILE='.$cert);
        config([
            "mail.mailers.{$mailer}.scheme" => 'smtp',
            "mail.mailers.{$mailer}.host" => 'localhost',
            "mail.mailers.{$mailer}.port" => $port,
            "mail.mailers.{$mailer}.username" => 'fake-user',
            "mail.mailers.{$mailer}.password" => 'fake-pass',
            "mail.mailers.{$mailer}.require_tls" => true,
            'mail.from.address' => 'reports@example.test',
        ]);
        app('mail.manager')->forgetMailers();

        return $port;
    }

    /** A loopback port with nothing listening on it. */
    private function unusedPort(): int
    {
        $probe = stream_socket_server('tcp://127.0.0.1:0');
        $port = (int) substr(strrchr((string) stream_socket_get_name($probe, false), ':'), 1);
        fclose($probe);

        return $port;
    }
}
