#!/usr/bin/env bash
#
# Build the living-documentation manual with the GUI chapters run HEADLESS in a
# Linux container (VS Code renders to a virtual display — nothing opens on your
# macOS desktop, and no window steals focus), then generate the single-file HTML
# manual on the host. This is the headless counterpart of build-manual.sh.
#
#   npm run manual:docker                 # always-on chapters (core + @stone)
#   npm run manual:docker -- download     # + the download chapter
#   npm run manual:docker -- download install
#
# The container writes each group's Cucumber JSON feed (screenshots embedded)
# back to cucumber-report/ under a FEED-named file; the host generator reads them
# all. download/install are slow and opt-in, so they run only when named.
set -uo pipefail

cd "$(dirname "$0")/.."   # acceptance/

rm -rf cucumber-report && mkdir -p cucumber-report

# Run one group headless in Docker, tagging its feed with FEED so feeds from
# different groups accumulate side by side. Never abort on a failing chapter —
# living docs show the truth.
indocker() { # FEED  playwright-args...
  local feed="$1"; shift
  bash scripts/docker-test.sh bash -lc \
    "cd acceptance && npx bddgen && FEED=$feed npx playwright test $*" || true
}

echo "==> core + stone chapters (headless)"
indocker main "--grep-invert '@tricky|@download|@wip'"

for group in "$@"; do
  case "$group" in
    download) echo "==> download"; indocker download "--grep @download" ;;
    install)  echo "==> install";  indocker install  "--grep @tricky" ;;
    *) echo "warning: unknown group '$group' (use: download install)" >&2 ;;
  esac
done

echo "==> generating the HTML manual on host"
npm --prefix manual run manual
