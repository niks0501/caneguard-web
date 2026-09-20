<?php

namespace App\Notifications;

class FollowUpDueNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'follow_up_due';

    public function __construct(
        string $recipientUuid,
        string $reportUuid,
        string $referenceCode,
        string $assignmentUuid,
        string $targetVisitDate,
    ) {
        parent::__construct(
            $recipientUuid,
            $reportUuid,
            $referenceCode,
            self::EVENT_TYPE,
            'Follow-up due',
            "The target visit date for {$referenceCode} passed on {$targetVisitDate}; field validation is still incomplete.",
            $assignmentUuid,
            'follow-up-due|'.$assignmentUuid.'|'.$targetVisitDate,
        );
        $this->targetVisitDate = $targetVisitDate;
    }

    public readonly string $targetVisitDate;

    protected function additionalData(): array
    {
        return ['target_visit_date' => $this->targetVisitDate];
    }
}
