---
name: jgengine-editor
description: Author scene content and assets through the JGengine editor.
---

# JGengine editor

## Ownership

This skill owns scene-document authoring: objects, spawns, markers, terrain, paths, zones, foliage, materials, and asset placement. `editor.scene.json` is the source of truth consumed by runtime and gameplay. Use `jgengine-world` for rendering and querying authored data.

Never replace authorable scene content with hardcoded meshes, coordinate arrays, or game-specific placement code. If the document or editor lacks a required kind, file a `[FEATURE]` issue before a code fallback and record the gap in the PR.

## Scene ownership boundary

Every editor-visible object has an explicit provenance — `authored`, `generated`, `runtime`, or `transient` — and a single verdict from `classifyOwnership` (`@jgengine/core/scene/sceneOwnership`): **expose** (authorable), **bake** (offer import to the document when the provider can emit schema-valid data), or **reject** (read-only runtime content). Runtime/transient content with neither a `bake` capability nor a declared `reason` is a boundary violation — content bypassing the document with no authored home. Genuinely runtime-only or geometry-free content is declared with a serializable `SceneOwnershipManifest` (`scene-ownership.json`), which `check-content-gate` validates — the replacement for game-name exemptions.

## Canonical workflow

1. Inspect the current scene and available editor capabilities.
2. Make authoring changes through the GUI or `bun packages/editor/src/mcp/cli.ts`; do not hand-edit the JSON.
3. Save the scene document and verify the intended objects/layers are present.
4. Make gameplay reference stable authored ids, path kinds, markers, or zones rather than copying coordinates.
5. Render through shared authored-scene primitives and verify with `jgengine-verify`.

Use `capabilities.md` to discover editor/runtime imports and `api.md` for signatures. Open [reference.md](reference.md) for RPC/CLI operations, embedded-agent behavior, scene schema details, and troubleshooting.

## Traps

- Selection and camera state are not authored world data. Terrain-readability guides (contours, surface-draped grid, elevation HUD) are editor visualization built from the live heightfield via headless `@jgengine/core/world/terrainGuides`; their toggles persist as editor prefs, never scene content.
- Runtime-generated decoration does not become editor-owned merely because it is visual; decide ownership explicitly.
- Asset-facing, units, pivot, footprint, and placement policy belong in asset/catalog metadata, not corrective game transforms.
- Paths and markers should drive both rendering and gameplay from the same document.
- Visual presence summaries prove content exists; only an inspected shot proves composition and finish.
