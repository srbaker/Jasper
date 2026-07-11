#!/usr/bin/env bash
#
# Stop the acceptance-owned stone + NetLDI (the fixture's teardown). Safe to call
# when nothing is running.
set -uo pipefail

VERSION="${1:?usage: stop-stone.sh <version>}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NETLDI_PORT=52020   # keep in sync with provision-stone.sh

cd "$REPO_ROOT/acceptance/.stone-cache"
export VERSION
export NAME="jasper-acceptance"
# shellcheck source=/dev/null
source "$REPO_ROOT/client/bin/gs-config.sh"

stopnetldi "$NETLDI_PORT" >/dev/null 2>&1 || true
echo "$GS_PASSWORD" | stopstone "$STONE_NAME" "$GS_USERNAME" -i >/dev/null 2>&1 || true
