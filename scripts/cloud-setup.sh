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
# Brightway Park's Quaternius packs: not committed, pulled into the shared asset store on a fresh session.
bun run jgengine assets pull quaternius-animated-characters-pack
bun run jgengine assets pull quaternius-lowpoly-modular-street-pack
bun run jgengine assets pull quaternius-low-poly-food-pack
bun run jgengine assets pull quaternius-lowpoly-buildings-pack

# Ember Command's Quaternius packs: not committed, pulled into the shared asset store on a fresh session.
bun run jgengine assets pull quaternius-lowpoly-rpg-characters
bun run jgengine assets pull quaternius-lowpoly-medieval-village-pack
bun run jgengine assets pull quaternius-lowpoly-medieval-buildings
bun run jgengine assets pull quaternius-fantasy-props
bun run jgengine assets pull quaternius-lowpoly-crops-pack

# Scrap Signal, Beacon Bastion and Fernwild's packs, mirrored to the packs release from Poly Pizza and itch.io.
bun run jgengine assets pull quaternius-toon-shooter
bun run jgengine assets pull quaternius-animated-mech-pack
bun run jgengine assets pull quaternius-animated-lowpoly-robot
bun run jgengine assets pull quaternius-low-poly-desert-assets
bun run jgengine assets pull kaykit-medieval-hexagon
bun run jgengine assets pull kaykit-forest
bun run jgengine assets pull quaternius-modular-men
bun run jgengine assets pull quaternius-modular-women
