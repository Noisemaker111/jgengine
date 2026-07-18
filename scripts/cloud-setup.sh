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
