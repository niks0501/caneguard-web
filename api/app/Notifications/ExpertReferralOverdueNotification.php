<?php

namespace App\Notifications;

use App\Models\ReportReferral;

class ExpertReferralOverdueNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'expert_referral_overdue';

    public function __construct(
        string $recipientUuid,
        string $reportUuid,
        string $referenceCode,
        ReportReferral $referral,
        bool $officeRecipient = false,
    ) {
        parent::__construct(
            $recipientUuid,
            $reportUuid,
            $referenceCode,
            self::EVENT_TYPE,
            $officeRecipient ? 'Expert referral overdue' : 'Expert referral overdue',
            $officeRecipient
                ? "The expert referral for {$referenceCode} is overdue and needs office follow-up."
                : "The expert referral for {$referenceCode} is overdue.",
            (string) $referral->getKey(),
            'expert-referral-overdue|'.$referral->getKey(),
        );

        $this->referralId = (string) $referral->getKey();
        $this->dueDate = $referral->due_date?->format('Y-m-d');
        $this->audience = $officeRecipient ? 'office' : 'expert';
    }

    public readonly string $referralId;

    public readonly ?string $dueDate;

    public readonly string $audience;

    protected function additionalData(): array
    {
        return [
            'referral_id' => $this->referralId,
            'due_date' => $this->dueDate,
            'audience' => $this->audience,
        ];
    }
}
