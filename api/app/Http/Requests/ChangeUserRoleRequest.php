<?php

namespace App\Http\Requests;

use App\Models\DistrictMembership;
use App\Models\User;
use App\Security\DistrictAccess;
use Illuminate\Validation\Rule;

class ChangeUserRoleRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        $access = app(DistrictAccess::class);
        $target = $this->route('user');

        return $target instanceof User && $target->hasVerifiedEmail()
            && in_array($target->role, User::roles(), true)
            && DistrictMembership::query()->where('user_id', $target->id)
                ->where('district_id', $access->pilotId())->whereNull('revoked_at')->exists()
            && $access->grant($this->user(), 'staff:manage', $access->pilotId()) !== null;
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'max:255'],
            'role' => ['required', 'string', Rule::in(User::roles())],
            'office_reference' => ['sometimes', 'string', 'max:160', 'regex:/\\S/'],
        ];
    }
}
