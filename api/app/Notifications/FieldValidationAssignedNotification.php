<?php

namespace App\Notifications;

class FieldValidationAssignedNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'field_validation_assigned';

    public function __construct(
        string $recipientUuid,
        string $reportUuid,
        string $referenceCode,
        string $assignmentUuid,
        ?string $targetVisitDate,
    ) {
        parent::__construct(
            $recipientUuid,
            $reportUuid,
            $referenceCode,
            self::EVENT_TYPE,
            'Field validation assigned',
            $targetVisitDate
                ? "{$referenceCode} was assigned to you for a field visit by {$targetVisitDate}."
                : "{$referenceCode} was assigned to you for field validation.",
            $assignmentUuid,
            'assignment-created|'.$assignmentUuid,
        );
        $this->targetVisitDate = $targetVisitDate;
    }

    public readonly ?string $targetVisitDate;

    protected function additionalData(): array
    {
        return ['target_visit_date' => $this->targetVisitDate];
    }
}
