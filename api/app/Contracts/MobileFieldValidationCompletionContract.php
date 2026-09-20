<?php

namespace App\Contracts;

use JsonException;
use RuntimeException;
use UnexpectedValueException;

final class MobileFieldValidationCompletionContract
{
    private const CONTRACT_PATH = '../docs/contracts/mobile-field-validation-completion-v1.json';

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
                "The mobile completion contract could not be read from {$path}.",
            );
        }

        $definition = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($definition)) {
            throw new UnexpectedValueException(
                'The mobile completion contract must decode to an object.',
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
                "The mobile completion contract does not define {$name}.",
            );
        }

        return $field;
    }

    /**
     * @return array<string, mixed>
     */
    public static function rules(): array
    {
        $fields = self::definition()['fields'];
        $rules = [];
        foreach ($fields as $name => $field) {
            $rules[$name] = self::rulesForField($name, $field);
        }

        return $rules;
    }

    /**
     * @param  array<string, mixed>  $field
     * @return array<int, string>
     */
    private static function rulesForField(string $name, array $field): array
    {
        $rules = [$field['required'] ? 'required' : 'nullable'];
        $type = $field['type'] ?? null;
        if ($type === 'uuid') {
            $rules[] = 'uuid';
        } elseif ($type === 'string') {
            $rules[] = 'string';
        } elseif ($type === 'date-time') {
            $rules[] = 'string';
            $rules[] = 'date';
        } elseif ($type === 'number') {
            $rules[] = 'numeric';
        } elseif ($type === 'image') {
            $rules = ['nullable', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'];
        }

        if (isset($field['max_length'])) {
            $rules[] = 'max:'.$field['max_length'];
        }
        if (isset($field['minimum'])) {
            $rules[] = 'gte:'.$field['minimum'];
        }
        if (isset($field['maximum'])) {
            $rules[] = 'lte:'.$field['maximum'];
        }
        if (isset($field['enum'])) {
            $rules[] = 'in:'.implode(',', $field['enum']);
        }

        return $rules;
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    private static function assertDefinition(array $definition): void
    {
        foreach (['artifact_format', 'contract', 'version', 'wire', 'authentication', 'fields', 'response', 'versioning'] as $key) {
            if (! array_key_exists($key, $definition)) {
                throw new UnexpectedValueException(
                    "The mobile completion contract is missing {$key}.",
                );
            }
        }

        if ($definition['artifact_format'] !== 'caneguard-multipart-contract'
            || $definition['contract'] !== 'mobile-field-validation-completion-v1'
            || $definition['version'] !== 1) {
            throw new UnexpectedValueException(
                'The API only supports mobile-field-validation-completion-v1.',
            );
        }

        if (! is_array($definition['wire'])
            || ($definition['wire']['method'] ?? null) !== 'POST'
            || ($definition['wire']['path'] ?? null) !== '/api/v1/mobile/assignments/{assignment}/completion') {
            throw new UnexpectedValueException(
                'The mobile completion contract wire declaration is invalid.',
            );
        }

        if (! is_array($definition['fields']) || $definition['fields'] === []) {
            throw new UnexpectedValueException(
                'The mobile completion contract must declare fields.',
            );
        }

        foreach ($definition['fields'] as $name => $field) {
            if (! is_array($field)) {
                throw new UnexpectedValueException(
                    "The mobile completion field {$name} must be an object.",
                );
            }
            foreach (['wire_type', 'type', 'required', 'nullable'] as $key) {
                if (! array_key_exists($key, $field)) {
                    throw new UnexpectedValueException(
                        "The mobile completion field {$name} is missing {$key}.",
                    );
                }
            }
        }
    }
}
