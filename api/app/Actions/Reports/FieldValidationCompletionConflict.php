<?php

namespace App\Actions\Reports;

use RuntimeException;

class FieldValidationCompletionConflict extends RuntimeException
{
    public const CONFLICT = 'CONFLICT';

    public const ASSIGNMENT_REASSIGNED = 'ASSIGNMENT_REASSIGNED';

    public const CASE_CLOSED = 'CASE_CLOSED';

    public const COMPLETED_ELSEWHERE = 'COMPLETED_ELSEWHERE';

    public const VISIT_REMOVED = 'VISIT_REMOVED';

    public function __construct(
        string $message,
        public readonly string $reasonCode = self::CONFLICT,
        public readonly ?string $completedAt = null,
    ) {
        parent::__construct($message);
    }

    public function httpStatus(): int
    {
        return $this->reasonCode === self::VISIT_REMOVED ? 404 : 409;
    }
}
