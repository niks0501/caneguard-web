#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
repo="$(git -C "${T3CODE_WORKTREE_PATH:-$PWD}" rev-parse --show-toplevel)"
repo="$(realpath -e -- "$repo")"
[[ -f "$repo/.git" && ! -L "$repo/.git" ]] || { echo 'Refusing main checkout. Select a linked worktree.' >&2; exit 1; }
[[ "$(git -C "$repo" rev-parse --path-format=absolute --git-dir)" != "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)" ]] || { echo 'Refusing main checkout.' >&2; exit 1; }
cd "$repo"
[[ -f api/artisan && -f api/composer.lock && -f package-lock.json ]] || { echo 'Not a CaneGuard Web/API checkout.' >&2; exit 1; }
api="$repo/api"
db="$api/database/t3-worktree.sqlite"
[[ -f "$api/.env" && ! -L "$api/.env" && -f "$api/vendor/autoload.php" && -f "$db" && ! -L "$db" && "$(realpath -e -- "$db")" == "$db" && "$(stat -c %h -- "$db")" == 1 ]] || { echo 'Run Web worktree preparation first.' >&2; exit 1; }
password_dir="$HOME/.config/caneguard/t3"
mkdir -p -- "$password_dir"
[[ ! -L "$password_dir" && -d "$password_dir" ]] || { echo 'Unsafe password directory.' >&2; exit 1; }
chmod 700 -- "$password_dir"
cd "$api"
CG_EXPECTED_DB="$db" CG_PASSWORD_FILE="$password_dir/test-accounts-password" php <<'PHP'
<?php
require getcwd().'/vendor/autoload.php';
$app = require getcwd().'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use App\Models\District;
use App\Models\DistrictMembership;
use App\Models\User;
use App\Security\DistrictAccess;
use Database\Seeders\DemoAccounts;
use Illuminate\Support\Facades\DB;
use Illuminate\Database\Eloquent\Model;

$expected = getenv('CG_EXPECTED_DB');
$connection = DB::connection();
if (!app()->environment('local') || config('database.default') !== 'sqlite'
    || $connection->getDriverName() !== 'sqlite'
    || config('database.connections.sqlite.url')
    || $connection->getDatabaseName() !== $expected
    || realpath($expected) !== $expected) {
    throw new RuntimeException('Refusing to seed: active Laravel connection is not the isolated local worktree database.');
}
$code = trim((string) config('caneguard.pilot_district_code'));
if ($code === '') {
    throw new RuntimeException('Set CANEGUARD_PILOT_DISTRICT_CODE in the worktree API .env.');
}
$file = getenv('CG_PASSWORD_FILE');
if (is_link($file)) {
    throw new RuntimeException('Refusing linked password file.');
}
if (!file_exists($file)) {
    $handle = @fopen($file, 'x');
    if ($handle !== false) {
        fwrite($handle, 'CgTest-'.bin2hex(random_bytes(18)).PHP_EOL);
        fclose($handle);
    }
}
if (!is_file($file) || is_link($file) || (fileperms($file) & 0077) !== 0) {
    throw new RuntimeException('Password file must be a private regular file (chmod 600).');
}
$password = trim((string) file_get_contents($file));
if (strlen($password) < 15 || strlen($password) > 72) {
    throw new RuntimeException('Test password must be 15–72 characters.');
}
config([
    'caneguard.demo_users.field_reporter_password' => $password,
    'caneguard.demo_users.reviewer_password' => $password,
    'caneguard.demo_users.admin_password' => $password,
]);
Model::withoutEvents(function () use ($code) {
    DB::transaction(function () use ($code) {
        $accounts = new DemoAccounts;
        $users = $accounts->seedUsers($accounts->validatedUsers());
        $district = District::query()->firstOrCreate(['code' => $code], ['name' => trim((string) config('caneguard.pilot_district_name')) ?: $code]);
        foreach ($users as $user) {
            $user->forceFill(['is_active' => true, 'onboarded_at' => $user->onboarded_at ?? now()])->save();
            DistrictMembership::query()->updateOrCreate(['user_id' => $user->id, 'district_id' => $district->id], ['revoked_at' => null]);
            $fresh = $user->fresh();
            $ready = $fresh->role === User::ROLE_FIELD_REPORTER
                ? app(DistrictAccess::class)->hasMobileCapability($fresh, 'report:submit')
                : $fresh->hasWebAccess();
            if (!$ready) {
                throw new RuntimeException('Test account access check failed for '.$user->email);
            }
        }
    });
});
echo "Three local test accounts and pilot memberships ready. No report or analytics seeders ran.\n";
PHP
echo 'Password saved privately in ~/.config/caneguard/t3/test-accounts-password. Do not commit it.'
