<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Pagination\Cursor;

class MobileFieldValidationAssignmentRequest extends ApiFormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === User::ROLE_FIELD_REPORTER;
    }

    public function rules(): array
    {
        return [
            'updated_after' => ['sometimes', 'date'],
            'sync_before' => ['sometimes', 'date'],
            'since' => ['sometimes', 'string', 'max:64'],
            'sync_version' => ['sometimes', 'string', 'max:64'],
            'limit' => ['sometimes', 'integer', 'min:1'],
            'cursor' => [
                'sometimes',
                'string',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    $cursor = Cursor::fromEncoded($value);
                    $parameters = $cursor?->toArray();

                    $validId = is_int($parameters['id'] ?? null)
                        || (
                            is_string($parameters['id'] ?? null)
                            && ctype_digit($parameters['id'])
                        );

                    if (
                        ! is_array($parameters)
                        || count($parameters) !== 2
                        || ! $validId
                        || (int) ($parameters['id'] ?? 0) < 1
                        || ! is_bool($parameters['_pointsToNextItems'] ?? null)
                    ) {
                        $fail('The cursor is invalid.');
                    }
                },
            ],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }
}
