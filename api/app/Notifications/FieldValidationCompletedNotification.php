<?php

namespace App\Notifications;

class FieldValidationCompletedNotification extends CaseAttentionNotification
{
    public const EVENT_TYPE = 'field_validation_completed';

    public function __construct(
        string $recipientUuid,
        string $reportUuid,
        string $referenceCode,
        string $assignmentUuid,
        string $completionUuid,
    ) {
        parent::__construct(
            $recipientUuid,
            $reportUuid,
            $referenceCode,
            self::EVENT_TYPE,
            'Field validation completed',
            "Field validation for {$referenceCode} is complete and ready for office review.",
            $assignmentUuid,
            'field-validation-completed|'.$completionUuid,
        );
    }
}
