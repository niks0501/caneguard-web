<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class StaffInvitationNotification extends Notification
{
    public function __construct(#[\SensitiveParameter] private readonly string $token) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        // Fragment is not sent to the web server in a URL/referrer.
        $url = (string) config('caneguard.auth.staff_invitation_url').'#'.$this->token;

        return (new MailMessage)
            ->subject('CaneGuard approved staff invitation')
            ->line('Your account has an approved staff roster entry. This invitation expires in 48 hours.')
            ->action('Accept staff invitation', $url)
            ->line('Use your verified account email and current password. Contact the office if this was not expected.');
    }
}
