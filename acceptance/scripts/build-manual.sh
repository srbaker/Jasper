#!/usr/bin/env bash
#
# Build the living-documentation manual: run the always-on chapters plus any
# opt-in groups you name, then generate the Astro site + PDF from all of them.
#
#   npm run manual:all                     # always-on chapters only
#   npm run manual:all -- download         # + the download chapter
#   npm run manual:all -- download install stone
#
# Opt-in groups (download, install, stone) are slow, stateful, or need a stone,
# so they run only when asked. Runs NATIVELY on macOS (VS Code windows flash),
# and does NOT abort on a failing chapter — living docs show the truth.
set -uo pipefail

cd "$(dirname "$0")/.."   # acceptance/

rm -rf cucumber-report && mkdir -p cucumber-report
npx bddgen

echo "==> core chapters (always on)"
FEED=core npx playwright test --grep-invert "@tricky|@download|@stone|@wip" || true

for group in "$@"; do
  case "$group" in
    download) echo "==> download";  FEED=download npx playwright test --grep @download || true ;;
    install)  echo "==> install";   FEED=install  npx playwright test --grep @tricky   || true ;;
    stone)    echo "==> stone";     FEED=stone    npx playwright test --grep @stone --grep-invert @wip || true ;;
    *) echo "warning: unknown group '$group' (use: download install stone)" >&2 ;;
  esac
done

echo "==> generating manual (site + PDF) from all feeds"
npm --prefix manual run manual
