#!/usr/bin/env bash
# Environment setup script for cloud agent sessions (Claude Code on the web,
# Codex cloud, and similar container runners).
#
# Configure your cloud environment to run this before the agent starts:
#   Claude Code on the web → environment settings → Setup script:
#     bash scripts/cloud-setup.sh
#
# Claude snapshots the filesystem after the first run and reuses it for later
# sessions (~7 days), so node_modules and package dist are already warm and
# agents skip the every-chat install/build entirely.
set -euo pipefail
cd "$(dirname "$0")/.."
bun run agent:bootstrap

# Packs a game's catalog names that the repo does not commit; games:provision links them from the shared store.
bun run jgengine assets pull quaternius-lowpoly-rpg-characters
bun run jgengine assets pull quaternius-lowpoly-medieval-village-pack
bun run jgengine assets pull quaternius-lowpoly-medieval-buildings
bun run jgengine assets pull quaternius-fantasy-props
bun run jgengine assets pull quaternius-lowpoly-crops-pack
