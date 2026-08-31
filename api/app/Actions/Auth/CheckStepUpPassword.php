<?php

namespace App\Actions\Auth;

use App\Models\SecurityAudit;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

final class CheckStepUpPassword
{
    public function __construct(private readonly RecordSecurityAudit $audits) {}

    public function handle(
        User $actor,
        string $password,
        string $protectedAction,
        ?User $target = null,
    ): bool {
        $valid = Hash::check($password, (string) $actor->getAuthPassword());

        $this->audits->handle(
            SecurityAudit::ACTION_STEP_UP,
            $valid ? SecurityAudit::OUTCOME_SUCCESS : SecurityAudit::OUTCOME_FAILURE,
            $actor,
            $target ?? $actor,
            [
                'protected_action' => $protectedAction,
                'method' => 'current_password',
            ],
        );

        return $valid;
    }
}
