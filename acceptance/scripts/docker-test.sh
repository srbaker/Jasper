#!/usr/bin/env bash
#
# Build and run the acceptance suite HEADLESS in a Linux container. VS Code
# renders to a virtual X display inside the container, so nothing opens on your
# desktop — the reliable way to run these on macOS, where VS Code can't truly
# headless. The Cucumber JSON feed (screenshots embedded) and Playwright traces
# are written back to the host under acceptance/, so `npm run manual` then builds
# the doc from them on the host.
#
# Extra args override the in-container command (xvfb-run still wraps it), e.g.
#   npm run test:docker -- bash -lc "cd acceptance && npm run test:download"
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

mkdir -p acceptance/cucumber-report acceptance/test-results

docker build -f acceptance/Dockerfile -t jasper-acceptance .

# Cache the (large) VS Code download across runs in a named volume.
docker volume create jasper-vscode-cache >/dev/null

exec docker run --rm --init \
  --shm-size=1g \
  -v jasper-vscode-cache:/app/.vscode-test \
  -v "$repo_root/acceptance/cucumber-report:/app/acceptance/cucumber-report" \
  -v "$repo_root/acceptance/test-results:/app/acceptance/test-results" \
  jasper-acceptance "$@"
