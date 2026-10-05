<?php

namespace App\Support;

use Closure;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

/** Narrow forward-replay helpers for nontransactional MySQL DDL. Never swallow SQL errors. */
final class MigrationReplay
{
    public static function create(string $name, Closure $definition): void
    {
        if (! Schema::hasTable($name)) {
            Schema::create($name, $definition);
        }

        // CREATE TABLE, foreign keys and indexes are separate MySQL statements.
        // A table-exists guard alone could silently omit its authority constraints.
        $blueprint = new Blueprint(Schema::getConnection(), $name);
        $blueprint->create();
        $definition($blueprint);
        $blueprint->toSql(); // Expand fluent column indexes, without executing DDL.
        foreach ($blueprint->getColumns() as $column) {
            if (! Schema::hasColumn($name, $column->name)) {
                throw new RuntimeException("Incomplete {$name} schema requires approved forward recovery: missing {$column->name}.");
            }
        }
        foreach ($blueprint->getCommands() as $command) {
            if ($command->name === 'foreign') {
                $references = (array) $command->references;
                self::foreign($name, $command->columns[0], $command->on, $references[0]);
            } elseif ($command->name === 'primary') {
                if (! Schema::hasIndex($name, $command->columns, 'primary')) {
                    Schema::table($name, fn (Blueprint $table) => $table->primary($command->columns, $command->index));
                }
            } elseif (in_array($command->name, ['index', 'unique'], true)) {
                self::index($name, $command->columns, $command->index, $command->name === 'unique');
            }
        }
    }

    public static function column(string $table, string $column, Closure $definition): void
    {
        if (! Schema::hasColumn($table, $column)) {
            Schema::table($table, $definition);
        }
    }

    public static function index(string $table, array $columns, string $name, bool $unique = false): void
    {
        foreach (Schema::getIndexes($table) as $index) {
            if (strtolower($index['name']) === strtolower($name)) {
                if ($index['columns'] !== $columns || $index['unique'] !== $unique) {
                    throw new RuntimeException("Unexpected constraint {$name}; operator recovery required.");
                }

                return;
            }
        }
        Schema::table($table, fn (Blueprint $blueprint) => $unique
            ? $blueprint->unique($columns, $name)
            : $blueprint->index($columns, $name));
    }

    public static function foreign(string $table, string $column, string $target, string $targetColumn = 'id'): void
    {
        foreach (Schema::getForeignKeys($table) as $foreign) {
            if ($foreign['columns'] === [$column]) {
                if ($foreign['foreign_table'] !== $target || $foreign['foreign_columns'] !== [$targetColumn]
                    || ! in_array(strtolower($foreign['on_delete']), ['restrict', 'no action'], true)) {
                    throw new RuntimeException("Unexpected {$table}.{$column} foreign key; operator recovery required.");
                }

                return;
            }
        }
        Schema::table($table, fn (Blueprint $blueprint) => $blueprint->foreign($column)
            ->references($targetColumn)->on($target)->restrictOnDelete());
    }

    public static function dropIndex(string $table, string $name): void
    {
        if (Schema::hasIndex($table, $name)) {
            Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropUnique($name));
        }
    }
}
