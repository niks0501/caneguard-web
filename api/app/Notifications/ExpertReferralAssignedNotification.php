<?php

namespace App\Notifications;

use App\Models\ReportReferral;

class ExpertReferralAssignedNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'expert_referral_assigned';

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
            'New expert referral assigned',
            "A referral for {$referenceCode} is ready for your expert response.",
            null,
            'expert-referral-assigned|'.$referral->getKey(),
        );

        $this->referralId = (string) $referral->getKey();
        $this->dueDate = $referral->due_date?->format('Y-m-d');
    }

    public readonly string $referralId;

    public readonly ?string $dueDate;

    /**
     * @return array<string, mixed>
     */
    protected function additionalData(): array
    {
        return [
            'referral_id' => $this->referralId,
            'due_date' => $this->dueDate,
        ];
    }
}
