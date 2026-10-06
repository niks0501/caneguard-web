<?php

namespace App\Models;

use App\Actions\Auth\RevokeUserAuthentication;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;
use Laravel\Sanctum\NewAccessToken;

#[Fillable(['name', 'email', 'password', 'role'])]
#[Hidden(['password', 'remember_token', 'auth_version'])]
class User extends Authenticatable implements MustVerifyEmail
{
    protected $attributes = ['access_version' => 1, 'registration_origin' => 'unknown', 'is_active' => true, 'auth_version' => 1];

    // Resolve the SQL increment before updated observers/DTOs inspect the saved identity.
    protected array $refreshes = ['access_version'];

    public const ROLE_FARMER = 'farmer';

    public const ROLE_FIELD_REPORTER = 'field_reporter';

    public const ROLE_REVIEWER = 'reviewer';

    public const ROLE_ADMIN = 'admin';

    /** @use HasFactory<UserFactory> */
    use HasApiTokens {
        createToken as private createSanctumToken;
    }

    use HasFactory, HasUuids, Notifiable;

    public function createToken(string $name, array $abilities = ['*'], ?\DateTimeInterface $expiresAt = null): NewAccessToken
    {
        $maximum = now()->addDays(30);
        $expiry = $expiresAt === null || $expiresAt > $maximum ? $maximum : $expiresAt;

        return $this->createSanctumToken($name, $abilities, $expiry);
    }

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
            self::ROLE_FARMER,
            self::ROLE_FIELD_REPORTER,
            self::ROLE_REVIEWER,
            self::ROLE_ADMIN,
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
        ];
    }

    public function isMobileUser(): bool
    {
        return $this->hasVerifiedEmail() && in_array($this->role, [self::ROLE_FARMER, self::ROLE_FIELD_REPORTER], true);
    }

    protected static function booted(): void
    {
        static::updating(function (self $user): void {
            if ($user->isDirty(['name', 'role', 'email', 'email_verified_at', 'password', 'biometric_enabled', 'registration_origin', 'is_active'])) {
                // Security writers may hold an older model than a concurrent grant decision.
                $user->access_version = DB::raw('access_version + 1');
            }
        });
        static::updated(function (self $user): void {
            if ($user->wasChanged(['role', 'is_active'])) {
                DistrictGrant::query()->where('user_id', $user->id)->update([
                    'revoked_at' => now()->utc(),
                    'revision' => DB::raw('revision + 1'),
                ]);
                app(RevokeUserAuthentication::class)->handle($user);
            }
        });
    }

    public function isOfficeUser(): bool
    {
        return in_array($this->role, self::officeRoles(), true);
    }

    public function isWebUser(): bool
    {
        return in_array($this->role, self::webRoles(), true);
    }

    public function hasWebAccess(): bool
    {
        return $this->is_active && $this->hasVerifiedEmail() && $this->isWebUser();
    }

    public function isActiveAdmin(): bool
    {
        return $this->hasWebAccess() && $this->role === self::ROLE_ADMIN;
    }

    public function accountReview(): HasOne
    {
        return $this->hasOne(AccountReview::class);
    }

    public function districtMemberships(): HasMany
    {
        return $this->hasMany(DistrictMembership::class);
    }

    public function districtGrants(): HasMany
    {
        return $this->hasMany(DistrictGrant::class);
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

    protected function accessVersion(): Attribute
    {
        return Attribute::get(fn ($value) => (int) $value);
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'biometric_enabled' => 'boolean',
            'is_active' => 'boolean',
            'auth_version' => 'integer',
            'password' => 'hashed',
        ];
    }
}
