<?php

namespace App\Contracts;

use JsonException;
use RuntimeException;
use UnexpectedValueException;

final class MobileNotificationContract
{
    private const CONTRACT_PATH = '../docs/contracts/mobile-notifications-v1.json';

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
                "The mobile notification contract could not be read from {$path}.",
            );
        }

        $definition = json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        if (! is_array($definition)) {
            throw new UnexpectedValueException(
                'The mobile notification contract must decode to an object.',
            );
        }

        self::assertDefinition($definition);

        return self::$definition = $definition;
    }

    /**
     * @param  array<string, mixed>  $definition
     */
    private static function assertDefinition(array $definition): void
    {
        foreach (['artifact_format', 'contract', 'version', 'wire', 'envelope', 'fields', 'versioning'] as $key) {
            if (! array_key_exists($key, $definition)) {
                throw new UnexpectedValueException(
                    "The mobile notification contract is missing {$key}.",
                );
            }
        }

        if ($definition['artifact_format'] !== 'caneguard-json-contract'
            || $definition['contract'] !== 'mobile-notifications-v1'
            || $definition['version'] !== 1
        ) {
            throw new UnexpectedValueException(
                'The API only supports mobile-notifications-v1.',
            );
        }

        if (! is_array($definition['wire'])
            || ($definition['wire']['method'] ?? null) !== 'GET'
            || ($definition['wire']['path'] ?? null) !== '/api/v1/mobile/notifications'
        ) {
            throw new UnexpectedValueException(
                'The mobile notification contract wire declaration is invalid.',
            );
        }

        if (! is_array($definition['fields']) || $definition['fields'] === []) {
            throw new UnexpectedValueException(
                'The mobile notification contract must declare fields.',
            );
        }
    }
}
