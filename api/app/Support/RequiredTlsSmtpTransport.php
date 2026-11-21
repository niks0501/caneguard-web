<?php

namespace App\Support;

use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;
use Symfony\Component\Mailer\Transport\Smtp\Stream\SocketStream;

/**
 * Symfony's EHLO-to-HELO fallback returns before its own TLS check, so this transport checks at every command instead:
 * until the connection is encrypted, only the handshake and session commands may be sent. Symfony's isTLS() reports
 * only implicit TLS, so a STARTTLS the server accepted is tracked per connection; Symfony sends EHLO again only after
 * that upgrade succeeds, and a failed upgrade ends the connection before any other command is sent.
 */
final class RequiredTlsSmtpTransport extends EsmtpTransport
{
    private const PLAINTEXT_COMMANDS = ['EHLO', 'HELO', 'STARTTLS', 'RSET', 'NOOP', 'QUIT'];

    private bool $startTlsAccepted = false;

    /** @param array<string, mixed> $config One mailer entry from config/mail.php */
    public static function fromConfig(array $config): self
    {
        $scheme = (string) ($config['scheme'] ?? '');
        if ($scheme === '') {
            $scheme = ((int) ($config['port'] ?? 0)) === 465 ? 'smtps' : 'smtp';
        }
        if (! in_array($scheme, ['smtp', 'smtps'], true)) {
            throw new \InvalidArgumentException("Unsupported SMTP scheme [{$scheme}].");
        }
        $autoTls = (bool) ($config['auto_tls'] ?? true);

        $transport = new self((string) $config['host'], (int) ($config['port'] ?? 0), $scheme === 'smtps' ? true : ($autoTls ? null : false));
        $transport->setAutoTls($autoTls);
        $transport->setRequireTls((bool) ($config['require_tls'] ?? false));
        if (! empty($config['username'])) {
            $transport->setUsername((string) $config['username']);
        }
        if (! empty($config['password'])) {
            $transport->setPassword((string) $config['password']);
        }
        if (! empty($config['local_domain'])) {
            $transport->setLocalDomain((string) $config['local_domain']);
        }
        $stream = $transport->getStream();
        if ($stream instanceof SocketStream && isset($config['timeout'])) {
            $stream->setTimeout((float) $config['timeout']);
        }

        return $transport;
    }

    public function start(): void
    {
        $this->startTlsAccepted = false;

        parent::start();
    }

    public function executeCommand(string $command, array $codes): string
    {
        $verb = strtoupper(explode(' ', trim($command), 2)[0]);
        $stream = $this->getStream();
        $encrypted = $this->startTlsAccepted || ($stream instanceof SocketStream && $stream->isTLS());
        if (! $encrypted && $this->isTlsRequired() && ! in_array($verb, self::PLAINTEXT_COMMANDS, true)) {
            throw new TransportException('TLS is required, so no SMTP command that carries an envelope, message or credential is sent over this connection.');
        }

        $response = parent::executeCommand($command, $codes);
        if ($verb === 'STARTTLS') {
            $this->startTlsAccepted = true;
        }

        return $response;
    }
}
