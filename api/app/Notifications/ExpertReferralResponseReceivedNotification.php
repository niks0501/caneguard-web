<?php

namespace App\Notifications;

class ExpertReferralResponseReceivedNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'expert_referral_response_received';

    public function __construct(
        string $recipientUuid,
        string $reportUuid,
        string $referenceCode,
        string $responseDate,
        string $responseVersion,
    ) {
        parent::__construct(
            $recipientUuid,
            $reportUuid,
            $referenceCode,
            self::EVENT_TYPE,
            'Expert referral response received',
            "An expert response for {$referenceCode} is ready for office review.",
            null,
            'expert-referral-response|'.$reportUuid.'|'.$responseVersion,
        );

        $this->responseDate = $responseDate;
    }

    public readonly string $responseDate;

    /**
     * @return array<string, mixed>
     */
    protected function additionalData(): array
    {
        return [
            'response_date' => $this->responseDate,
        ];
    }
}
