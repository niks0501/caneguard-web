<?php

namespace App\Http\Requests;

use App\Contracts\MobileFieldValidationCompletionContract;
use App\Models\FieldValidationAssignment;
use App\Models\User;
use App\Security\DistrictAccess;
use DateTimeImmutable;
use Illuminate\Validation\Validator;

class MobileFieldValidationCompletionRequest extends ApiFormRequest
{
    protected function prepareForValidation(): void
    {
        $normalized = [];
        foreach (['field_observation', 'field_finding', 'action_taken'] as $field) {
            if ($this->has($field) && is_string($this->input($field))) {
                $normalized[$field] = trim($this->string($field)->toString());
            }
        }
        if ($normalized !== []) {
            $this->merge($normalized);
        }
    }

    public function authorize(): bool
    {
        $assignment = $this->route('assignment');

        return $this->user()?->role === User::ROLE_FIELD_REPORTER
            && $assignment instanceof FieldValidationAssignment
            && $assignment->assignee_id === $this->user()->getKey()
            && app(DistrictAccess::class)->report($this->user(), $assignment->report, true);
    }

    public function rules(): array
    {
        return MobileFieldValidationCompletionContract::rules();
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            foreach (['visited_at', 'gps_attempted_at'] as $field) {
                $value = $this->input($field);
                if (is_string($value) && ! $this->isDateTime($value)) {
                    $validator->errors()->add($field, 'The field must be an ISO date-time value.');
                }
            }

            $latitude = $this->input('gps_latitude');
            $longitude = $this->input('gps_longitude');
            $accuracy = $this->input('gps_accuracy');
            $hasLatitude = $latitude !== null && $latitude !== '';
            $hasLongitude = $longitude !== null && $longitude !== '';
            $hasAccuracy = $accuracy !== null && $accuracy !== '';

            if ($hasLatitude !== $hasLongitude) {
                $validator->errors()->add('gps_latitude', 'GPS coordinates must be provided together.');
                $validator->errors()->add('gps_longitude', 'GPS coordinates must be provided together.');
            }
            if (($hasLatitude || $hasLongitude) !== $hasAccuracy) {
                $validator->errors()->add('gps_accuracy', 'GPS accuracy is required when coordinates are provided.');
            }
            if (! $hasLatitude && $hasAccuracy) {
                $validator->errors()->add('gps_accuracy', 'GPS accuracy cannot be provided without coordinates.');
            }
        });
    }

    /**
     * Keep the contract's ISO-8601 range broader than the current Mobile
     * serializer, while still rejecting impossible calendar dates.
     */
    private function isDateTime(string $value): bool
    {
        if (preg_match(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/D',
            $value,
        ) !== 1) {
            return false;
        }

        $hasFraction = str_contains($value, '.');
        $format = $hasFraction
            ? '!Y-m-d\\TH:i:s.uP'
            : '!Y-m-d\\TH:i:sP';
        $normalized = str_ends_with($value, 'Z')
            ? substr($value, 0, -1).'+00:00'
            : $value;
        $parsed = DateTimeImmutable::createFromFormat($format, $normalized);
        $errors = DateTimeImmutable::getLastErrors();

        return $parsed !== false
            && ($errors === false
                || ($errors['warning_count'] === 0 && $errors['error_count'] === 0));
    }
}
