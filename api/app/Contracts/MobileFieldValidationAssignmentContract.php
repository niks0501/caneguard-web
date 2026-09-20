<?php

namespace App\Contracts;

use JsonException;
use RuntimeException;
use UnexpectedValueException;

final class MobileFieldValidationAssignmentContract
{
    private const CONTRACT_PATH = '../docs/contracts/mobile-field-validation-assignment-v1.json';

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
                "The mobile assignment contract could not be read from {$path}.",
            );
        }

        $definition = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($definition)) {
            throw new UnexpectedValueException(
                'The mobile assignment contract must decode to an object.',
            );
        }

        self::assertDefinition($definition);

        return self::$definition = $definition;
    }

    /**
     * @return array<string, mixed>
     */
    public static function field(string $name): array
    {
        $field = self::definition()['fields'][$name] ?? null;
        if (! is_array($field)) {
            throw new UnexpectedValueException(
                "The mobile assignment contract does not define {$name}.",
            );
        }

        return $field;
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    private static function assertDefinition(array $definition): void
    {
        foreach (['artifact_format', 'contract', 'version', 'wire', 'envelope', 'fields', 'versioning'] as $key) {
            if (! array_key_exists($key, $definition)) {
                throw new UnexpectedValueException(
                    "The mobile assignment contract is missing {$key}.",
                );
            }
        }

        if ($definition['artifact_format'] !== 'caneguard-json-contract'
            || $definition['contract'] !== 'mobile-field-validation-assignment-v1'
            || $definition['version'] !== 1) {
            throw new UnexpectedValueException(
                'The API only supports mobile-field-validation-assignment-v1.',
            );
        }

        if (! is_array($definition['wire'])
            || (($definition['wire']['method'] ?? null) !== 'GET')
            || (($definition['wire']['path'] ?? null) !== '/api/v1/mobile/assignments')) {
            throw new UnexpectedValueException(
                'The mobile assignment contract wire declaration is invalid.',
            );
        }

        if (! is_array($definition['fields']) || $definition['fields'] === []) {
            throw new UnexpectedValueException(
                'The mobile assignment contract must declare fields.',
            );
        }

        foreach ($definition['fields'] as $name => $field) {
            if (! is_array($field)) {
                throw new UnexpectedValueException(
                    "The mobile assignment field {$name} must be an object.",
                );
            }
            foreach (['type', 'required', 'nullable'] as $key) {
                if (! array_key_exists($key, $field)) {
                    throw new UnexpectedValueException(
                        "The mobile assignment field {$name} is missing {$key}.",
                    );
                }
            }
        }
    }
}
