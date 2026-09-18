<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'password', 'role'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail
{
    public const ROLE_FIELD_REPORTER = 'field_reporter';

    public const ROLE_REVIEWER = 'reviewer';

    public const ROLE_ADMIN = 'admin';

    public const ROLE_EXPERT = 'expert';

    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasUuids, Notifiable;

    /**
     * Get the columns that should receive unique identifiers.
     *
     * @return array<int, string>
     */
    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    /**
     * Get the roles supported by the current authorization model.
     *
     * @return array<int, string>
     */
    public static function roles(): array
    {
        return [
            self::ROLE_FIELD_REPORTER,
            self::ROLE_REVIEWER,
            self::ROLE_ADMIN,
            self::ROLE_EXPERT,
        ];
    }

    /**
     * Get the roles that can use the broad office workspace and queues.
     *
     * @return array<int, string>
     */
    public static function officeRoles(): array
    {
        return [
            self::ROLE_REVIEWER,
            self::ROLE_ADMIN,
        ];
    }

    /**
     * Get the roles that can use the authenticated Web workspace.
     *
     * @return array<int, string>
     */
    public static function webRoles(): array
    {
        return [
            ...self::officeRoles(),
            self::ROLE_EXPERT,
        ];
    }

    public function isOfficeUser(): bool
    {
        return in_array($this->role, self::officeRoles(), true);
    }

    public function isWebUser(): bool
    {
        return in_array($this->role, self::webRoles(), true);
    }

    public function isExpert(): bool
    {
        return $this->role === self::ROLE_EXPERT;
    }

    /**
     * @return HasMany<Report, $this>
     */
    public function submittedReports(): HasMany
    {
        return $this->hasMany(Report::class, 'reporter_id');
    }

    /**
     * @return HasMany<Report, $this>
     */
    public function reviewedReports(): HasMany
    {
        return $this->hasMany(Report::class, 'reviewer_id');
    }

    /**
     * @return HasMany<FieldValidationAssignment, $this>
     */
    public function fieldValidationAssignments(): HasMany
    {
        return $this->hasMany(FieldValidationAssignment::class, 'assignee_id');
    }

    /**
     * @return HasMany<FieldValidationAssignment, $this>
     */
    public function createdFieldValidationAssignments(): HasMany
    {
        return $this->hasMany(FieldValidationAssignment::class, 'assigned_by_id');
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'biometric_enabled' => 'boolean',
            'password' => 'hashed',
        ];
    }
}
