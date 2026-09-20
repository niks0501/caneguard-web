<?php

namespace App\Http\Requests;

use App\Models\User;
use Carbon\CarbonImmutable;
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
            'cursor' => [
                'sometimes',
                'string',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    $cursor = Cursor::fromEncoded($value);
                    $parameters = $cursor?->toArray();
                    $validTimestamp = false;

                    if (is_array($parameters) && is_string($parameters['updated_at'] ?? null)) {
                        try {
                            CarbonImmutable::parse($parameters['updated_at']);
                            $validTimestamp = true;
                        } catch (\Throwable) {
                            // Keep malformed cursor failures on the API error contract.
                        }
                    }

                    $validId = is_int($parameters['id'] ?? null)
                        || (
                            is_string($parameters['id'] ?? null)
                            && ctype_digit($parameters['id'])
                        );

                    if (
                        ! is_array($parameters)
                        || count($parameters) !== 3
                        || ! $validTimestamp
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
