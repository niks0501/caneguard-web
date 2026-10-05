<?php

namespace App\Contracts;

use Closure;
use DateTimeImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\File;
use JsonException;
use LogicException;
use RuntimeException;
use UnexpectedValueException;

class MobileReportUploadContract
{
    protected const CONTRACT_PATH = '../docs/contracts/mobile-report-upload-v1.json';

    protected const EXPECTED_CONTRACT = 'mobile-report-upload-v1';

    protected const EXPECTED_VERSION = 1;

    /**
     * @var array<string, array<string, mixed>>
     */
    private static array $definitions = [];

    /**
     * @return array<string, mixed>
     *
     * @throws JsonException
     */
    public static function definition(): array
    {
        $contractClass = static::class;
        if (isset(self::$definitions[$contractClass])) {
            return self::$definitions[$contractClass];
        }

        $path = base_path(static::CONTRACT_PATH);
        $contents = file_get_contents($path);

        if ($contents === false) {
            throw new RuntimeException(
                "The mobile report upload contract could not be read from {$path}.",
            );
        }

        $definition = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);

        if (! is_array($definition)) {
            throw new UnexpectedValueException(
                'The mobile report upload contract must decode to an object.',
            );
        }

        static::assertDefinition($definition);

        return self::$definitions[$contractClass] = $definition;
    }

    /**
     * @return array<string, mixed>
     */
    public static function field(string $name): array
    {
        $field = static::definition()['fields'][$name] ?? null;

        if (! is_array($field)) {
            throw new UnexpectedValueException(
                "The mobile report upload contract does not define {$name}.",
            );
        }

        return $field;
    }

    /**
     * @return array<int, string>
     */
    public static function enumValues(string $field): array
    {
        $values = static::field($field)['enum'] ?? null;

        if (! is_array($values) || array_filter($values, 'is_string') !== $values) {
            throw new UnexpectedValueException(
                "The mobile report upload contract does not define a string enum for {$field}.",
            );
        }

        return array_values($values);
    }

    /**
     * @return array<string, mixed>
     */
    public static function normalization(Request $request): array
    {
        $normalized = [];

        foreach (static::definition()['fields'] as $name => $field) {
            if (! is_array($field)) {
                continue;
            }

            if (array_key_exists('default', $field) && ! $request->has($name)) {
                $normalized[$name] = $field['default'];
            }

            $normalization = $field['normalization'] ?? [];
            if (! is_array($normalization)) {
                continue;
            }

            if (($normalization['empty_string'] ?? null) === 'null'
                && $request->input($name) === '') {
                $normalized[$name] = null;
            }

            $booleanStrings = $normalization['boolean_strings'] ?? null;
            if (is_array($booleanStrings)
                && is_string($request->input($name))
                && array_key_exists($request->input($name), $booleanStrings)) {
                $normalized[$name] = $booleanStrings[$request->input($name)];
            }
        }

        return $normalized;
    }

    /**
     * Compile the canonical field declarations into the Laravel request rules.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function rules(Request $request): array
    {
        $rules = [];

        foreach (static::definition()['fields'] as $name => $field) {
            if (! is_array($field)) {
                throw new UnexpectedValueException(
                    "The mobile report upload field {$name} must be an object.",
                );
            }

            $rules[$name] = self::fieldRules($field, $request);

            if (isset($field['items'])) {
                if (! is_array($field['items'])) {
                    throw new UnexpectedValueException(
                        "The mobile report upload items definition for {$name} must be an object.",
                    );
                }

                $rules["{$name}.*"] = self::fieldRules(
                    $field['items'],
                    $request,
                    ($field['unique_items'] ?? false) === true,
                );
            }

            if (isset($field['values'])) {
                if (! is_array($field['values'])) {
                    throw new UnexpectedValueException(
                        "The mobile report upload values definition for {$name} must be an object.",
                    );
                }

                $rules["{$name}.*"] = self::fieldRules(
                    $field['values'],
                    $request,
                );
            }
        }

        return $rules;
    }

    /**
     * @param  array<string, mixed>  $definition
     * @return array<int, mixed>
     */
    private static function fieldRules(
        array $definition,
        Request $request,
        bool $distinct = false,
    ): array {
        $rules = [];

        if (($definition['required'] ?? false) === true) {
            $rules[] = 'required';
        } elseif (array_key_exists('default', $definition)) {
            $rules[] = 'present';
        } elseif (($definition['nullable'] ?? false) === true) {
            $rules[] = 'nullable';
        }

        $type = $definition['type'] ?? null;

        if (! is_string($type)) {
            throw new UnexpectedValueException(
                'Every mobile report upload field must declare a type.',
            );
        }

        switch ($type) {
            case 'string':
                $rules[] = 'string';
                self::appendStringRules($rules, $definition);
                break;
            case 'uuid':
                $rules[] = 'uuid';
                break;
            case 'number':
                $rules[] = 'numeric';
                self::appendNumericRules($rules, $definition);
                break;
            case 'integer':
                $rules[] = 'integer';
                self::appendNumericRules($rules, $definition);
                break;
            case 'boolean':
                $rules[] = 'boolean';
                break;
            case 'date-time':
                $rules[] = 'date';
                $rules[] = self::isoDateTimeRule();
                break;
            case 'array':
                $rules[] = 'array';
                self::appendCollectionRules($rules, $definition);
                break;
            case 'object':
                $rules[] = 'array';
                self::appendObjectRules($rules, $definition, $request);
                break;
            case 'image':
                $rules[] = self::imageRule($definition);
                break;
            default:
                throw new UnexpectedValueException(
                    "Unsupported mobile report upload field type {$type}.",
                );
        }

        if (isset($definition['enum'])) {
            if (! is_array($definition['enum'])) {
                throw new UnexpectedValueException(
                    'Mobile report upload enum values must be an array.',
                );
            }

            $rules[] = Rule::in($definition['enum']);
        }

        if ($distinct) {
            $rules[] = 'distinct';
        }

        foreach ($definition['conditions'] ?? [] as $condition) {
            if (! is_array($condition)) {
                throw new UnexpectedValueException(
                    'Mobile report upload conditions must be objects.',
                );
            }

            $rule = $condition['rule'] ?? null;

            if ($rule === 'required_with') {
                $fields = $condition['fields'] ?? null;
                if (! is_array($fields) || $fields === []) {
                    throw new UnexpectedValueException(
                        'required_with conditions need one or more fields.',
                    );
                }

                $rules[] = 'required_with:'.implode(',', $fields);
            } elseif ($rule === 'required_if') {
                $rules[] = sprintf(
                    'required_if:%s,%s',
                    $condition['field'],
                    $condition['value'],
                );
            } elseif ($rule === 'prohibited_unless') {
                $rules[] = Rule::prohibitedIf(
                    fn (): bool => $request->input($condition['field'])
                        !== $condition['value'],
                );
            } elseif ($rule === 'prohibited_when') {
                $rules[] = Rule::prohibitedIf(
                    fn (): bool => $request->input($condition['field'])
                        === $condition['value'],
                );
            } elseif ($rule === 'model_class_keys') {
                // Applied by appendObjectRules before compiling the object shape.
                continue;
            } elseif ($rule === 'measurement_pairing') {
                $valueField = $condition['value_field'] ?? null;
                if (! is_string($valueField) || $valueField === '') {
                    throw new UnexpectedValueException(
                        'measurement_pairing conditions need a value_field.',
                    );
                }

                $rules[] = static function (
                    string $attribute,
                    mixed $value,
                    Closure $fail,
                ) use ($request, $valueField): void {
                    $raw = $request->input($valueField);
                    $hasValue = $raw !== null && $raw !== '';

                    if ($value === 'measured' && ! $hasValue) {
                        $fail("The {$valueField} field is required when {$attribute} is measured.");
                    }

                    if ($value === 'not_measured' && $hasValue) {
                        $fail("The {$valueField} field must be omitted when {$attribute} is not measured.");
                    }
                };
            } else {
                throw new UnexpectedValueException(
                    "Unsupported mobile report upload condition {$rule}.",
                );
            }
        }

        return $rules;
    }

    private static function isoDateTimeRule(): Closure
    {
        return static function (
            string $attribute,
            mixed $value,
            Closure $fail,
        ): void {
            if (! is_string($value)
                || preg_match(
                    '/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,6})?(?:Z|[+-]\\d{2}:\\d{2})$/D',
                    $value,
                ) !== 1) {
                $fail("The {$attribute} field must be an ISO-8601 date-time.");

                return;
            }

            $format = str_contains($value, '.')
                ? '!Y-m-d\\TH:i:s.uP'
                : '!Y-m-d\\TH:i:sP';
            $date = DateTimeImmutable::createFromFormat($format, $value);
            $errors = DateTimeImmutable::getLastErrors();

            if ($date === false
                || ($errors !== false
                    && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) {
                $fail("The {$attribute} field must be an ISO-8601 date-time.");
            }
        };
    }

    /**
     * @param  array<int, mixed>  $rules
     * @param  array<string, mixed>  $definition
     */
    private static function appendStringRules(array &$rules, array $definition): void
    {
        if (array_key_exists('max_length', $definition)) {
            $rules[] = 'max:'.$definition['max_length'];
        }
    }

    /**
     * @param  array<int, mixed>  $rules
     * @param  array<string, mixed>  $definition
     */
    private static function appendNumericRules(array &$rules, array $definition): void
    {
        if (array_key_exists('minimum', $definition)) {
            $rules[] = 'min:'.$definition['minimum'];
        }

        if (array_key_exists('maximum', $definition)) {
            $rules[] = 'max:'.$definition['maximum'];
        }

        if (array_key_exists('exclusive_minimum', $definition)) {
            $rules[] = 'gt:'.$definition['exclusive_minimum'];
        }
    }

    /**
     * @param  array<int, mixed>  $rules
     * @param  array<string, mixed>  $definition
     */
    private static function appendCollectionRules(array &$rules, array $definition): void
    {
        if (array_key_exists('min_items', $definition)) {
            $rules[] = 'min:'.$definition['min_items'];
        }

        if (array_key_exists('max_items', $definition)) {
            $rules[] = 'max:'.$definition['max_items'];
        }
    }

    /**
     * @param  array<int, mixed>  $rules
     * @param  array<string, mixed>  $definition
     */
    private static function appendObjectRules(array &$rules, array $definition, Request $request): void
    {
        foreach ($definition['conditions'] ?? [] as $condition) {
            if (($condition['rule'] ?? null) === 'model_class_keys'
                && $request->input($condition['field']) === $condition['value']) {
                $definition['required_keys'] = $condition['required_keys'];
                $definition['additional_properties'] = $condition['additional_properties'];
            }
        }

        if (($definition['additional_properties'] ?? true) === false) {
            $rules[] = 'array:'.implode(',', $definition['required_keys'] ?? []);
        }

        if (isset($definition['key_pattern'])) {
            $pattern = '/'.$definition['key_pattern'].'/D';
            $rules[] = static function (string $attribute, mixed $value, Closure $fail) use ($pattern): void {
                if (! is_array($value)) {
                    return;
                }
                foreach (array_keys($value) as $key) {
                    if (! is_string($key) || preg_match($pattern, $key) !== 1) {
                        $fail("The {$attribute} keys must be class identifiers of at most 32 characters.");
                        break;
                    }
                }
            };
        }

        $minProperties = $definition['min_properties'] ?? null;
        $maxProperties = $definition['max_properties'] ?? null;

        if ($minProperties !== null && $minProperties === $maxProperties) {
            $rules[] = 'size:'.$minProperties;
        } else {
            if ($minProperties !== null) {
                $rules[] = 'min:'.$minProperties;
            }

            if ($maxProperties !== null) {
                $rules[] = 'max:'.$maxProperties;
            }
        }

        if (isset($definition['required_keys'])) {
            if (! is_array($definition['required_keys']) || $definition['required_keys'] === []) {
                throw new UnexpectedValueException(
                    'required_keys must be a non-empty array when declared.',
                );
            }

            $rules[] = 'required_array_keys:'.implode(',', $definition['required_keys']);
        }
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    private static function imageRule(array $definition): File
    {
        $extensions = [];
        $mimeTypes = [];

        foreach ($definition['formats'] ?? [] as $format) {
            if (! is_array($format)) {
                throw new UnexpectedValueException(
                    'Mobile report image formats must be objects.',
                );
            }

            $extensions = array_merge($extensions, $format['extensions'] ?? []);
            $mimeTypes = array_merge($mimeTypes, $format['mime_types'] ?? []);
        }

        $maxBytes = $definition['max_bytes'] ?? null;
        if (! is_int($maxBytes) || $maxBytes <= 0 || $maxBytes % 1024 !== 0) {
            throw new LogicException(
                'The mobile report image maximum must be a positive whole number of KiB.',
            );
        }

        return File::image()
            ->types(array_merge($extensions, $mimeTypes))
            ->max(intdiv($maxBytes, 1024));
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    private static function assertDefinition(array $definition): void
    {
        foreach (['artifact_format', 'contract', 'version', 'wire', 'fields', 'versioning'] as $key) {
            if (! array_key_exists($key, $definition)) {
                throw new UnexpectedValueException(
                    "The mobile report upload contract is missing {$key}.",
                );
            }
        }

        if ($definition['artifact_format'] !== 'caneguard-multipart-contract'
            || $definition['contract'] !== static::EXPECTED_CONTRACT
            || $definition['version'] !== static::EXPECTED_VERSION) {
            throw new UnexpectedValueException(
                'The Laravel mobile report request does not support this contract version.',
            );
        }

        if (! is_array($definition['wire'])) {
            throw new UnexpectedValueException(
                'The mobile report upload contract wire declaration must be an object.',
            );
        }

        if (! is_array($definition['fields']) || $definition['fields'] === []) {
            throw new UnexpectedValueException(
                'The mobile report upload contract must declare fields.',
            );
        }

        foreach ($definition['fields'] as $name => $field) {
            if (! is_array($field)) {
                throw new UnexpectedValueException(
                    "The mobile report upload field {$name} must be an object.",
                );
            }

            foreach (['wire_type', 'type', 'required', 'nullable'] as $key) {
                if (! array_key_exists($key, $field)) {
                    throw new UnexpectedValueException(
                        "The mobile report upload field {$name} is missing {$key}.",
                    );
                }
            }

            if (! is_bool($field['required']) || ! is_bool($field['nullable'])) {
                throw new UnexpectedValueException(
                    "The mobile report upload field {$name} has invalid presence metadata.",
                );
            }
        }
    }
}
