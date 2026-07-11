#!/usr/bin/env bash
#
# Provision an acceptance-owned GemStone stone, reusing the repo's gs-*.sh config
# but isolated from the client test stone. Prints the connection details as JSON
# on stdout (NOT .env.test — the caller knows the params because it provisioned
# them).
#
# The install + cached DMG live under acceptance/.stone-cache (git-ignored); the
# extent is reset from the shipped pristine copy on every run. Bare uses
# extent0.dbf; rowan uses the shipped, pre-loaded extent0.rowan3.dbf.
#
# NetLDI runs on an explicit numeric PORT: the GCI resolves a NetLDI *name* via
# getaddrinfo, which fails for our ad-hoc name, so a port connects directly.
#
# Usage: provision-stone.sh <version> <bare|rowan>
set -euo pipefail

ACC_VERSION="${1:?usage: provision-stone.sh <version> <bare|rowan>}"
EXTENT_KIND="${2:-bare}"

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GS_BIN="$REPO_ROOT/client/bin"
CACHE="$REPO_ROOT/acceptance/.stone-cache"
NETLDI_PORT=52020   # distinct from the default 50377 so it never clashes

mkdir -p "$CACHE"
cd "$CACHE"                        # → INSTALL_DIR/DOWNLOAD_DIR resolve under here

export VERSION="$ACC_VERSION"
export NAME="jasper-acceptance"
# shellcheck source=/dev/null
source "$GS_BIN/gs-config.sh"

# Install once (cached). Seed the DMG from the download chapter's cache, if
# present, so we don't re-download a release we already have.
if [[ ! -d "$GEMSTONE" ]]; then
  dmg="$REPO_ROOT/acceptance/.download-cache/gemstone-root/${FILENAME}"
  if [[ -f "$dmg" && ! -f "$ARCHIVE" ]]; then
    mkdir -p "$DOWNLOAD_DIR"
    cp -c "$dmg" "$ARCHIVE" 2>/dev/null || cp "$dmg" "$ARCHIVE"
  fi
  "$GS_BIN/gs-install.sh" "$VERSION" >&2
fi

# Stop any prior acceptance stone/NetLDI (port- or name-based); ignore if down.
gslist -c >/dev/null 2>&1 || true
stopnetldi "$NETLDI_PORT" >/dev/null 2>&1 || true
stopnetldi "$LDI_NAME" >/dev/null 2>&1 || true
echo "$GS_PASSWORD" | stopstone "$STONE_NAME" "$GS_USERNAME" -i >/dev/null 2>&1 || true

# Reset the extent from the shipped pristine copy.
case "$EXTENT_KIND" in
  bare)  SRC="${GEMSTONE}/bin/extent0.dbf" ;;
  rowan) SRC="${GEMSTONE}/bin/extent0.rowan3.dbf" ;;
  *) echo "unknown extent kind: $EXTENT_KIND (use bare|rowan)" >&2; exit 1 ;;
esac
[[ -f "$SRC" ]] || { echo "shipped extent not found: $SRC" >&2; exit 1; }
mkdir -p "$GEMSTONE_DATA_DIR"
rm -f "${GEMSTONE_DATA_DIR}/extent0.dbf"
copydbf "$SRC" "${GEMSTONE_DATA_DIR}/extent0.dbf" >&2
chmod 600 "${GEMSTONE_DATA_DIR}/extent0.dbf"

# Start the stone, then a NetLDI on the explicit port.
startstone "$STONE_NAME" >&2
startnetldi "$NETLDI_PORT" -g >&2
echo "GemStone ${VERSION} up: stone=${STONE_NAME}, netldi port=${NETLDI_PORT}" >&2

cat <<JSON
{
  "version": "${VERSION}",
  "host": "localhost",
  "stone": "${STONE_NAME}",
  "netldi": "${NETLDI_PORT}",
  "user": "${GS_USERNAME}",
  "password": "${GS_PASSWORD}",
  "gciLibraryPath": "${GCI_LIBRARY_PATH}"
}
JSON
