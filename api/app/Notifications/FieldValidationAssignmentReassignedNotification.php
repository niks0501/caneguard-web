<?php

namespace App\Notifications;

class FieldValidationAssignmentReassignedNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'field_validation_assignment_reassigned';

    public function __construct(
        string $recipientUuid,
        string $reportUuid,
        string $referenceCode,
        string $assignmentUuid,
        string $changeKey,
    ) {
        parent::__construct(
            $recipientUuid,
            $reportUuid,
            $referenceCode,
            self::EVENT_TYPE,
            'Field validation visit reassigned',
            "The field-validation visit for {$referenceCode} was reassigned to another inspector.",
            $assignmentUuid,
            'assignment-reassigned|'.$assignmentUuid.'|'.$changeKey,
        );
    }
}
