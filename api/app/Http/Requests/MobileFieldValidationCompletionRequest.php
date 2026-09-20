<?php

namespace App\Http\Requests;

use App\Contracts\MobileFieldValidationCompletionContract;
use App\Models\FieldValidationAssignment;
use App\Models\User;
use Carbon\CarbonImmutable;
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
            && $assignment->assignee_id === $this->user()->getKey();
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

    private function isDateTime(string $value): bool
    {
        if (! preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/', $value)) {
            return false;
        }

        try {
            CarbonImmutable::parse($value);

            return true;
        } catch (\Throwable) {
            return false;
        }
    }
}
