<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'actor_id',
    'target_user_id',
    'action',
    'outcome',
    'metadata',
    'created_at',
])]
class SecurityAudit extends Model
{
    public const OUTCOME_SUCCESS = 'success';

    /** Successful records of these actions prove onboarding; they are kept past retention until the account is marked. */
    public const ONBOARDING_EVIDENCE_ACTIONS = [self::ACTION_PASSWORD_RESET, self::ACTION_PASSWORD_CHANGE, self::ACTION_MOBILE_LOGIN];

    public const OUTCOME_FAILURE = 'failure';

    public const ACTION_REGISTRATION = 'registration';

    public const ACTION_EMAIL_VERIFICATION = 'email_verification';

    public const ACTION_VERIFICATION_RESEND = 'verification_resend';

    public const ACTION_PASSWORD_RESET = 'password_reset';

    public const ACTION_PASSWORD_CHANGE = 'password_change';

    public const ACTION_EMAIL_CHANGE = 'email_change';

    public const ACTION_MOBILE_LOGIN = 'mobile_login';

    public const ACTION_MOBILE_DEVICE_ENROLLMENT = 'mobile_device_enrollment';

    public const ACTION_MOBILE_DEVICE_REVOCATION = 'mobile_device_revocation';

    public const ACTION_BIOMETRIC_DISABLEMENT = 'biometric_disablement';

    public const ACTION_ROLE_CHANGE = 'role_change';

    public const ACTION_STEP_UP = 'step_up';

    public const ACTION_ACCOUNT_CREATED = 'account_created';

    public const ACTION_ACCOUNT_INVITE = 'account_invite_sent';

    public const ACTION_BOOTSTRAP_DISTRICT = 'bootstrap_district_created';

    public const ACTION_SCHEDULER_CRON_OBSERVED = 'scheduler_cron_observed';

    public const ACTION_PRUNE_RUN = 'prune_run';

    public const ACTION_OPERATOR_LINK = 'operator_link_issued';

    public const ACTION_WEEKLY_REPORTS_GENERATED = 'weekly_reports_generated';

    public $timestamps = false;

    /**
     * @return BelongsTo<User, $this>
     */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function targetUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'target_user_id');
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'created_at' => 'immutable_datetime',
        ];
    }
}
