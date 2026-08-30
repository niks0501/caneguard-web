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

    public const OUTCOME_FAILURE = 'failure';

    public const ACTION_REGISTRATION = 'registration';

    public const ACTION_EMAIL_VERIFICATION = 'email_verification';

    public const ACTION_VERIFICATION_RESEND = 'verification_resend';

    public const ACTION_PASSWORD_RESET = 'password_reset';

    public const ACTION_PASSWORD_CHANGE = 'password_change';

    public const ACTION_EMAIL_CHANGE = 'email_change';

    public const ACTION_MOBILE_LOGIN = 'mobile_login';

    public const ACTION_MOBILE_DEVICE_ENROLLMENT = 'mobile_device_enrollment';

    public const ACTION_BIOMETRIC_DISABLEMENT = 'biometric_disablement';

    public const ACTION_ROLE_CHANGE = 'role_change';

    public const ACTION_STEP_UP = 'step_up';

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
