#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
repo="$(git -C "${T3CODE_WORKTREE_PATH:-$PWD}" rev-parse --show-toplevel)"
repo="$(realpath -e -- "$repo")"
[[ -f "$repo/.git" && ! -L "$repo/.git" ]] || { echo 'Refusing main checkout. Select a linked worktree.' >&2; exit 1; }
[[ "$(git -C "$repo" rev-parse --path-format=absolute --git-dir)" != "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)" ]] || { echo 'Refusing main checkout.' >&2; exit 1; }
cd "$repo"
[[ -f api/artisan && -f api/composer.lock && -f package-lock.json ]] || { echo 'Not a CaneGuard Web/API checkout.' >&2; exit 1; }
npm run verify:fast
npm run check:api
