<?php

namespace App\Contracts;

use JsonException;
use RuntimeException;
use UnexpectedValueException;

final class ReportLifecycleContract
{
    private const CONTRACT_PATH = '../docs/contracts/report-lifecycle-v1.json';

    private const DIMENSION_NAMES = [
        'case_state',
        'verification_outcome',
        'field_validation_state',
        'referral_state',
    ];

    private const DIMENSION_VALUES = [
        'case_state' => ['open', 'closed'],
        'verification_outcome' => ['not_determined', 'verified', 'unable_to_verify'],
        'field_validation_state' => ['unassigned', 'assigned', 'in_progress', 'completed'],
        'referral_state' => ['not_referred', 'referred', 'expert_response_received'],
    ];

    private const LEGACY_STATUSES = [
        'submitted_unverified',
        'for_field_validation',
        'verified_by_staff',
        'unable_to_verify',
        'resolved',
        'unknown',
    ];

    private const PAYLOAD_CONTRACTS = [
        'mobile-report-upload-v1',
        'mobile-field-validation-assignment-v1',
        'mobile-field-validation-completion-v1',
        'mobile-notifications-v1',
    ];

    /**
     * @var array<string, mixed>|null
     */
    private static ?array $definition = null;

    /**
     * @return array<string, mixed>
     *
     * @throws JsonException
     */
    public static function definition(): array
    {
        if (self::$definition !== null) {
            return self::$definition;
        }

        $path = base_path(self::CONTRACT_PATH);
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new RuntimeException(
                "The report lifecycle contract could not be read from {$path}.",
            );
        }

        $definition = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($definition)) {
            throw new UnexpectedValueException(
                'The report lifecycle contract must decode to an object.',
            );
        }

        self::assertDefinition($definition);

        return self::$definition = $definition;
    }

    /**
     * @return array<int, string>
     */
    public static function values(string $dimension): array
    {
        if (! in_array($dimension, self::DIMENSION_NAMES, true)) {
            throw new UnexpectedValueException(
                "The report lifecycle contract does not define {$dimension}.",
            );
        }

        $values = self::definition()['dimensions'][$dimension]['values'] ?? null;
        if (! is_array($values) || array_filter($values, 'is_string') !== $values) {
            throw new UnexpectedValueException(
                "The report lifecycle contract does not define states for {$dimension}.",
            );
        }

        return array_values($values);
    }

    /**
     * @return array{case_state: string, verification_outcome: string, field_validation_state: string, referral_state: string}
     */
    public static function legacyProjection(string $status): array
    {
        $projection = self::definition()['legacy_projection'][$status]
            ?? self::definition()['legacy_projection']['unknown']
            ?? null;

        if (! is_array($projection)) {
            throw new UnexpectedValueException(
                "The report lifecycle contract does not define a legacy projection for {$status}.",
            );
        }

        return [
            'case_state' => (string) $projection['case_state'],
            'verification_outcome' => (string) $projection['verification_outcome'],
            'field_validation_state' => (string) $projection['field_validation_state'],
            'referral_state' => (string) $projection['referral_state'],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        $rules = self::definition()['rules'] ?? null;
        if (! is_array($rules)) {
            throw new UnexpectedValueException(
                'The report lifecycle contract does not define lifecycle rules.',
            );
        }

        return $rules;
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    private static function assertDefinition(array $definition): void
    {
        foreach ([
            '$id',
            'artifact_format',
            'contract',
            'version',
            'status',
            'owner',
            'dimensions',
            'legacy_projection',
            'rules',
            'payload_contracts',
            'versioning',
        ] as $key) {
            if (! array_key_exists($key, $definition)) {
                throw new UnexpectedValueException(
                    "The report lifecycle contract is missing {$key}.",
                );
            }
        }

        if ($definition['artifact_format'] !== 'caneguard-lifecycle-contract'
            || $definition['contract'] !== 'report-lifecycle-v1'
            || $definition['version'] !== 1
            || $definition['status'] !== 'stable'
        ) {
            throw new UnexpectedValueException(
                'The API only supports report-lifecycle-v1.',
            );
        }

        if (! is_array($definition['dimensions'])
            || array_keys($definition['dimensions']) !== self::DIMENSION_NAMES
        ) {
            throw new UnexpectedValueException(
                'The report lifecycle dimensions are invalid.',
            );
        }

        foreach (self::DIMENSION_NAMES as $dimension) {
            $definitionForDimension = $definition['dimensions'][$dimension];
            if (! is_array($definitionForDimension)
                || ! self::containsRequiredStates($definitionForDimension['values'] ?? null, self::DIMENSION_VALUES[$dimension])
            ) {
                throw new UnexpectedValueException(
                    "The report lifecycle dimension {$dimension} is invalid.",
                );
            }
        }

        if (! is_array($definition['legacy_projection'])
            || array_keys($definition['legacy_projection']) !== self::LEGACY_STATUSES
        ) {
            throw new UnexpectedValueException(
                'The report lifecycle legacy projections are invalid.',
            );
        }

        foreach (self::LEGACY_STATUSES as $status) {
            $projection = $definition['legacy_projection'][$status];
            if (! is_array($projection)
                || array_keys($projection) !== self::DIMENSION_NAMES
            ) {
                throw new UnexpectedValueException(
                    "The report lifecycle legacy projection {$status} is invalid.",
                );
            }
            foreach (self::DIMENSION_NAMES as $dimension) {
                if (! in_array(
                    $projection[$dimension],
                    $definition['dimensions'][$dimension]['values'],
                    true,
                )) {
                    throw new UnexpectedValueException(
                        "The report lifecycle legacy projection {$status} has an invalid {$dimension}.",
                    );
                }
            }
        }

        if (! is_array($definition['rules'])) {
            throw new UnexpectedValueException(
                'The report lifecycle rules are invalid.',
            );
        }
        $rules = $definition['rules'];
        foreach ([
            'verification_does_not_close_case',
            'field_validation_completion_does_not_verify_or_close',
            'referral_is_not_verification_outcome',
            'field_reporter_can_complete_assignment',
            'field_reporter_can_close_case',
            'completed_validation_cannot_be_reassigned_or_removed',
        ] as $rule) {
            if (! is_bool($rules[$rule] ?? null)) {
                throw new UnexpectedValueException(
                    "The report lifecycle rule {$rule} is invalid.",
                );
            }
        }
        if (! self::sameList($rules['final_disposition_roles'] ?? null, ['reviewer', 'admin'])
            || ($rules['ai_evidence_role'] ?? null) !== 'decision_support_only'
        ) {
            throw new UnexpectedValueException(
                'The report lifecycle authority rules are invalid.',
            );
        }

        if (! self::sameList($definition['payload_contracts'], self::PAYLOAD_CONTRACTS)
            || ! is_array($definition['versioning'])
        ) {
            throw new UnexpectedValueException(
                'The report lifecycle contract sections are invalid.',
            );
        }
    }

    private static function sameList(mixed $actual, array $expected): bool
    {
        return is_array($actual)
            && count($actual) === count($expected)
            && array_values($actual) === array_values($expected);
    }

    private static function containsRequiredStates(mixed $actual, array $required): bool
    {
        $states = is_array($actual) ? array_values($actual) : null;
        if ($states === null
            || array_filter($states, 'is_string') !== $states
            || count(array_unique($states)) !== count($states)
        ) {
            return false;
        }

        $cursor = 0;
        foreach ($required as $value) {
            $index = array_search($value, $states, true);
            if ($index === false || $index < $cursor) {
                return false;
            }
            $cursor = $index + 1;
        }

        return true;
    }
}
