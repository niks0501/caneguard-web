<?php

namespace App\Notifications;

use App\Models\ReportReferral;

class ExpertReferralDueSoonNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'expert_referral_due_soon';

    public function __construct(
        string $recipientUuid,
        string $reportUuid,
        string $referenceCode,
        ReportReferral $referral,
    ) {
        parent::__construct(
            $recipientUuid,
            $reportUuid,
            $referenceCode,
            self::EVENT_TYPE,
            'Expert referral due soon',
            "The expert referral for {$referenceCode} is due tomorrow.",
            (string) $referral->getKey(),
            'expert-referral-due|'.$referral->getKey(),
        );

        $this->referralId = (string) $referral->getKey();
        $this->dueDate = $referral->due_date?->format('Y-m-d');
    }

    public readonly string $referralId;

    public readonly ?string $dueDate;

    protected function additionalData(): array
    {
        return ['referral_id' => $this->referralId, 'due_date' => $this->dueDate];
    }
}
