<?php

declare(strict_types=1);

/**
 * Read-only Linux/POSIX access-ACL preflight. Does not load Laravel, read file
 * contents, impersonate a user, or change permissions. Run after cache creation.
 */
final class ReleaseAccess
{
    private array $metadata = [];
    private array $permissions = [];
    private array $visited = [];

    public function __construct(private int $uid, private array $groups) {}

    public static function command(array $arguments): string
    {
        $process = proc_open($arguments, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) {
            throw new RuntimeException('Cannot start access metadata command');
        }
        fclose($pipes[0]);
        $output = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        // Never emit command output/errors: only permission metadata is needed.
        $error = stream_get_contents($pipes[2]);
        fclose($pipes[2]);
        if (proc_close($process) !== 0 || $output === false || $error !== '') {
            throw new RuntimeException('Access metadata command failed');
        }
        return $output;
    }

    private function metadata(string $path): array
    {
        if (!isset($this->metadata[$path])) {
            $stat = @lstat($path);
            if ($stat === false) {
                $this->deny($path, 'missing or inaccessible metadata');
            }
            $this->metadata[$path] = $stat;
        }
        return $this->metadata[$path];
    }

    private function deny(string $path, string $reason): never
    {
        // Escape path delimiters/control characters; never read .env/config/logs.
        throw new RuntimeException($reason.' at '.json_encode($path, JSON_INVALID_UTF8_SUBSTITUTE));
    }

    private function effective(string $path): array
    {
        if (isset($this->permissions[$path])) {
            return $this->permissions[$path];
        }
        $stat = $this->metadata($path);
        $acl = [];
        foreach (explode("\n", self::command(['getfacl', '-c', '-p', '-n', '--', $path])) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, 'default:')) {
                continue;
            }
            if (!preg_match('/^(user|group|mask|other):([0-9]*):([r-][w-][x-])(?:\s+#.*)?$/D', $line, $match)) {
                $this->deny($path, 'unrecognized access ACL');
            }
            $key = $match[1].':'.$match[2];
            if (isset($acl[$key])) {
                $this->deny($path, 'duplicate access ACL');
            }
            $acl[$key] = ($match[3][0] === 'r' ? 4 : 0)
                | ($match[3][1] === 'w' ? 2 : 0) | ($match[3][2] === 'x' ? 1 : 0);
        }
        foreach (['user:', 'group:', 'other:'] as $entry) {
            if (!isset($acl[$entry])) {
                $this->deny($path, 'incomplete access ACL');
            }
        }
        foreach (array_keys($acl) as $entry) {
            if (preg_match('/^(user|group):[0-9]+$/D', $entry) && !isset($acl['mask:'])) {
                $this->deny($path, 'named access ACL without mask');
            }
        }
        $mask = $acl['mask:'] ?? 7;
        // acl(5) precedence: owner, named user, matching groups, other.
        // One matching group entry must cover the entire requested operation;
        // combining partial rights across groups would overstate Linux access.
        // Matched-but-denied entries never fall back to other permissions.
        if ($stat['uid'] === $this->uid) {
            $result = [$acl['user:']];
        } elseif (isset($acl['user:'.$this->uid])) {
            $result = [$acl['user:'.$this->uid] & $mask];
        } else {
            $result = [];
            foreach ($this->groups as $gid) {
                if ($stat['gid'] === $gid) {
                    $result[] = $acl['group:'] & $mask;
                }
                if (isset($acl['group:'.$gid])) {
                    $result[] = $acl['group:'.$gid] & $mask;
                }
            }
            if ($result === []) {
                $result = [$acl['other:']];
            }
        }
        return $this->permissions[$path] = $result;
    }

    private function requirePermissions(string $path, int $bits): void
    {
        foreach ($this->effective($path) as $permissions) {
            if (($permissions & $bits) === $bits) {
                return;
            }
        }
        $this->deny($path, 'insufficient effective PHP-FPM permissions');
    }

    private function resolve(string $path): string
    {
        if (!str_starts_with($path, '/')) {
            $this->deny($path, 'absolute path required');
        }
        $pending = explode('/', $path);
        $resolved = '/';
        $links = 0;
        while ($pending !== []) {
            $component = array_shift($pending);
            if ($component === '' || $component === '.') {
                continue;
            }
            if (($this->metadata($resolved)['mode'] & 0170000) !== 0040000) {
                $this->deny($resolved, 'ancestor is not a directory');
            }
            $this->requirePermissions($resolved, 1);
            if ($component === '..') {
                $resolved = dirname($resolved);
                continue;
            }
            $next = rtrim($resolved, '/').'/'.$component;
            if (($this->metadata($next)['mode'] & 0170000) === 0120000) {
                $target = @readlink($next);
                if ($target === false || ++$links > 40) {
                    $this->deny($next, 'unresolvable symlink');
                }
                if (str_starts_with($target, '/')) {
                    $resolved = '/';
                }
                $pending = array_merge(explode('/', $target), $pending);
            } else {
                $resolved = $next;
            }
        }
        return $resolved;
    }

    public function requireType(string $path, int $type): void
    {
        $resolved = $this->resolve($path);
        if (($this->metadata($resolved)['mode'] & 0170000) !== $type) {
            $this->deny($path, 'required release artifact missing or wrong type');
        }
    }

    public function tree(string $path, bool $writable = false): void
    {
        $resolved = $this->resolve($path);
        $type = $this->metadata($resolved)['mode'] & 0170000;
        if ($type !== 0040000 && $type !== 0100000) {
            $this->deny($path, 'unsupported filesystem object');
        }
        $this->requirePermissions($resolved, 4 | ($writable ? 2 : 0) | ($type === 0040000 ? 1 : 0));
        $key = ($writable ? 'write:' : 'read:').$resolved;
        if (isset($this->visited[$key])) {
            return;
        }
        $this->visited[$key] = true;
        if ($type === 0040000) {
            $entries = @scandir($resolved);
            if ($entries === false) {
                $this->deny($resolved, 'cannot enumerate required directory');
            }
            foreach ($entries as $entry) {
                if ($entry !== '.' && $entry !== '..') {
                    $this->tree($resolved.'/'.$entry, $writable);
                }
            }
        }
    }
}

try {
    if ($argc !== 2 || !str_starts_with($argv[1], '/')) {
        throw new RuntimeException('Usage: php verify-release-access.php /absolute/inactive-release');
    }
    // Baseline: the FPM pool runs as www-data with its system group membership.
    $uid = trim(ReleaseAccess::command(['id', '-u', 'www-data']));
    $groups = trim(ReleaseAccess::command(['id', '-G', 'www-data']));
    if (!preg_match('/^[0-9]+$/D', $uid) || (int) $uid === 0 ||
        !preg_match('/^[0-9]+(?:\s+[0-9]+)*$/D', $groups)) {
        throw new RuntimeException('Cannot establish non-root PHP-FPM identity');
    }
    $access = new ReleaseAccess((int) $uid, array_map('intval', preg_split('/\s+/', $groups)));
    $release = rtrim($argv[1], '/');
    foreach (['app', 'bootstrap/cache', 'config', 'routes', 'resources', 'vendor', 'public/assets',
        'storage/app', 'storage/framework/cache/data', 'storage/framework/sessions',
        'storage/framework/views', 'storage/logs'] as $directory) {
        $access->requireType($release.'/api/'.$directory, 0040000);
    }
    foreach (['.env', 'vendor/autoload.php', 'bootstrap/app.php', 'bootstrap/cache/config.php',
        'public/index.php', 'public/index.html'] as $file) {
        $access->requireType($release.'/api/'.$file, 0100000);
    }
    // Includes application/vendor/frontend, generated bootstrap caches, .env and
    // compiled views. Validation follows symlinks read-only, checking both paths'
    // ancestors; the permission mutation in deploy-production.sh remains -P.
    $access->tree($release);
    // Check existing files too (logs/cache/sessions/uploads), not just parents.
    $access->tree($release.'/api/storage', true);
    echo "PASS: Inactive release POSIX access checks for www-data\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'Release access preflight failed: '.$error->getMessage()."\n");
    exit(1);
}
