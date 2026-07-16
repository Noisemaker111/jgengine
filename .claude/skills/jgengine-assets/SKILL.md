---
name: jgengine-assets
description: Source, license, catalog, and resolve game-ready media assets.
---

# JGengine assets

## Ownership

This skill owns model, sprite, texture/material, and audio-file discovery; licensing; catalog metadata; pull/index workflows; and runtime asset references. Placement belongs to `jgengine-editor`, spatial audio behavior to `jgengine-world`, and rendering/UI composition to their respective domains.

Search [capabilities.md](capabilities.md) before adding a resolver or catalog path. Use [api.md](api.md) for exact exports.

## Canonical workflow

1. Prefer existing catalog entries and typed asset refs.
2. Verify source license and attribution requirements before download.
3. Record canonical facing, source units, pivot, footprint, bounds, and placement policy in metadata.
4. Pull/index through shared tooling; do not commit remote-library bulk bytes when the catalog is designed to resolve them.
5. Preview through the same resolver runtime will use.
6. Add required credit in the same PR.

## Source rules

- Never use or reference Kenney.nl assets.
- Prefer Quaternius or KayKit for CC0 3D, game-icons.net for icons, and ambientCG for PBR.
- Preserve third-party license and attribution data with the catalog entry.
- A permissive source allows copying assets, not transplanting another game's implementation.

## Traps

- Fix wrong scale/facing/pivot upstream in catalog metadata, never with per-game corrective transforms.
- Asset ids and metadata are stable data contracts; filenames and URLs are implementation details.
- Missing attribution is a release blocker even when the code works.

