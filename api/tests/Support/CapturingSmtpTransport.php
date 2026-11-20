<?php

namespace Tests\Support;

use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;

/** An SMTP transport that keeps each delivered message in memory instead of connecting to a server. */
final class CapturingSmtpTransport extends EsmtpTransport
{
    /** @var list<SentMessage> */
    public array $sent = [];

    protected function doSend(SentMessage $message): void
    {
        $this->sent[] = $message;
    }
}
