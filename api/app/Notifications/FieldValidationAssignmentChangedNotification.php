<?php

namespace App\Notifications;

class FieldValidationAssignmentChangedNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'field_validation_assignment_changed';

    public function __construct(
        string $recipientUuid,
        string $reportUuid,
        string $referenceCode,
        string $assignmentUuid,
        ?string $targetVisitDate,
        string $changeKey,
    ) {
        parent::__construct(
            $recipientUuid,
            $reportUuid,
            $referenceCode,
            self::EVENT_TYPE,
            'Field validation assignment changed',
            $targetVisitDate
                ? "The field-validation visit for {$referenceCode} is now targeted for {$targetVisitDate}."
                : "The field-validation assignment for {$referenceCode} was updated.",
            $assignmentUuid,
            'assignment-changed|'.$assignmentUuid.'|'.$changeKey,
        );
        $this->targetVisitDate = $targetVisitDate;
    }

    public readonly ?string $targetVisitDate;

    protected function additionalData(): array
    {
        return ['target_visit_date' => $this->targetVisitDate];
    }
}
