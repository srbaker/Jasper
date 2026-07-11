#!/usr/bin/env bash
#
# Build the COMPLETE living-documentation manual: run every chapter group into
# its own Cucumber feed, then generate the Astro site + PDF from all of them.
#
# Runs NATIVELY on macOS, so VS Code windows flash briefly during the runs. It
# does NOT abort on a failing chapter — living documentation shows the truth, so
# a failed scenario still lands in the manual (marked failed).
set -uo pipefail

cd "$(dirname "$0")/.."   # acceptance/

rm -rf cucumber-report && mkdir -p cucumber-report
npx bddgen

echo "==> core chapters (sidebar, trust)"
FEED=core npx playwright test --grep-invert "@tricky|@download" || true

echo "==> download chapter (cached after first fetch)"
FEED=download npx playwright test --grep @download || true

echo "==> generating manual (site + PDF) from all feeds"
npm --prefix manual run manual
