#!/bin/bash
# bundle.sh — TafsirLingo JS bundler
# Safari Web Extension content scripts and background scripts do NOT support
# static or dynamic imports. This script uses esbuild to bundle each entry
# point into a single IIFE file, which is what manifest.json references.
#
# Two outputs are produced:
#   1. Resources/content.bundle.js + Resources/background.bundle.js (source
#      tree, used as a fallback for direct file:// loading and for code review)
#   2. A copy inside the extension's .appex bundle so it ends up in the
#      installed Safari Web Extension. Required because Xcode's
#      fileSystemSynchronizedRootGroup scans the source tree BEFORE this
#      script phase runs, so generated .bundle.js files don't get picked up
#      into the .appex automatically.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="$REPO_ROOT/TafsirLingo Extension"
RES="$EXT_DIR/Resources"
APPEX_RES="${APPEX_RESOURCES_DIR:-}"

log() { printf '[bundle.sh] %s\n' "$*"; }
fail() { printf '[bundle.sh] ERROR: %s\n' "$*" >&2; exit 1; }

[ -d "$RES" ] || fail "Resources dir not found: $RES"
[ -f "$RES/content.js" ] || fail "Missing $RES/content.js"
[ -f "$RES/background.js" ] || fail "Missing $RES/background.js"
[ -d "$RES/lib" ] || fail "Missing $RES/lib"

# Locate a runnable esbuild. Try local first, then npx fallback.
run_esbuild() {
  if [ -x "$REPO_ROOT/node_modules/.bin/esbuild" ]; then
    "$REPO_ROOT/node_modules/.bin/esbuild" "$@"
  elif command -v esbuild >/dev/null 2>&1; then
    esbuild "$@"
  elif command -v npx >/dev/null 2>&1; then
    npx --yes esbuild "$@"
  else
    fail "esbuild not found (no node_modules/.bin/esbuild, no global esbuild, no npx)"
  fi
}

log "bundling content.js -> content.bundle.js"
run_esbuild "$RES/content.js" \
  --bundle --format=iife --target=safari15 \
  --outfile="$RES/content.bundle.js" || fail "esbuild failed for content.js"

log "bundling background.js -> background.bundle.js"
run_esbuild "$RES/background.js" \
  --bundle --format=iife --target=safari15 \
  --outfile="$RES/background.bundle.js" || fail "esbuild failed for background.js"

# When running inside an Xcode build phase, write the bundles directly into
# the .appex (set via $TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH).
# This is the source of truth that Safari loads — writing to the source
# tree only would require an extra Resources-phase copy and would create a
# build cycle. The source-tree copy is kept for ad-hoc tooling and code
# review (matches what `git diff` shows).
if [ -n "$TARGET_BUILD_DIR" ] && [ -n "$UNLOCALIZED_RESOURCES_FOLDER_PATH" ] && [ -d "$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH" ]; then
  APPEX_RES="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
  log "writing bundles directly into .appex at $APPEX_RES"
  cp "$RES/content.bundle.js" "$APPEX_RES/content.bundle.js"
  cp "$RES/background.bundle.js" "$APPEX_RES/background.bundle.js"
elif [ -n "$APPEX_RES" ] && [ -d "$APPEX_RES" ]; then
  log "copying bundles into $APPEX_RES"
  cp "$RES/content.bundle.js" "$APPEX_RES/content.bundle.js"
  cp "$RES/background.bundle.js" "$APPEX_RES/background.bundle.js"
fi

log "OK: bundled content.bundle.js + background.bundle.js"