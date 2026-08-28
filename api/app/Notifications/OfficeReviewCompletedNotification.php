<?php

namespace App\Notifications;

class OfficeReviewCompletedNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'office_review_completed';

    public function __construct(
        string $recipientUuid,
        string $reportUuid,
        string $referenceCode,
        ?string $assignmentUuid,
        string $reviewVersion,
    ) {
        parent::__construct(
            $recipientUuid,
            $reportUuid,
            $referenceCode,
            self::EVENT_TYPE,
            'Office review completed',
            "Office review for {$referenceCode} has been updated.",
            $assignmentUuid,
            'office-review-completed|'.$reportUuid.'|'.$reviewVersion,
        );
    }
}
