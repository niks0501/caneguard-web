<?php

namespace App\Actions\Reports;

use App\Models\DistrictReportVersion;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;

/** Dedicated SMTP mailer: require TLS and certificate verification, never log/array fallback. */
class SendWeeklyReportSmtp
{
    public function send(DistrictReportVersion $version, array $recipients, string $bytes, string $filename): string
    {
        if ($recipients === [] || count($recipients) > 20) {
            throw new \RuntimeException('Invalid recipient contract.');
        }
        foreach ($recipients as $recipient) {
            if (! is_string($recipient) || filter_var($recipient, FILTER_VALIDATE_EMAIL) === false) {
                throw new \RuntimeException('Invalid recipient contract.');
            }
        }
        $mailer = Mail::mailer('weekly_smtp');
        $transport = $mailer->getSymfonyTransport();
        if (! $transport instanceof EsmtpTransport || ! $transport->isTlsRequired()) {
            throw new \RuntimeException('Encrypted SMTP is required.');
        }
        $sent = $mailer->raw('Please find the approved CaneGuard weekly field report attached. Version '.$version->version.'.', function (Message $message) use ($recipients, $bytes, $filename, $version): void {
            $message->to($recipients)->subject('CaneGuard Weekly Field Report · '.$version->content['period']['week'].' · v'.$version->version)
                ->attachData($bytes, $filename, ['mime' => 'application/pdf']);
            // Correlates an uncertain/crashed attempt with provider logs; not a delivery guarantee.
            $message->getSymfonyMessage()->getHeaders()->addTextHeader('X-CaneGuard-Version', $version->uuid);
        });
        $id = $sent?->getMessageId();
        if (! is_string($id) || $id === '' || strlen($id) > 160) {
            throw new \RuntimeException('Provider acceptance receipt unavailable.');
        }

        return $id;
    }
}
