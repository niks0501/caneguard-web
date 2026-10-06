<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ChangeUserRoleRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        $target = $this->route('user');

        return $target instanceof User && Gate::allows('manageLegacy', $target);
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
