---
name: jgengine-assets
description: Source, license, catalog, and resolve game-ready media assets.
---

# JGengine assets

## Ownership

This skill owns model, sprite, texture/material, and audio-file discovery; licensing; catalog metadata; pull/index workflows; and runtime asset references. Placement belongs to `jgengine-editor`, spatial audio behavior to `jgengine-world`, and rendering/UI composition to their respective domains.

Search [capabilities.md](capabilities.md) before adding a resolver or catalog path. Use [api.md](api.md) for exact exports. Turning a real item or scene into an asset via video capture and 3D reconstruction is a sourcing method under this skill — see [references/video-to-3d-capture.md](references/video-to-3d-capture.md) for the offline pipeline, hardware/cost notes, and import steps.

## Canonical workflow

1. Prefer existing catalog entries and typed asset refs.
2. Verify source license and attribution requirements before download.
3. Record canonical facing, source units, pivot, footprint, bounds, and placement policy in metadata.
4. Pull/index through shared tooling; do not commit remote-library bulk bytes when the catalog is designed to resolve them.
5. Preview through the same resolver runtime will use.
6. Add required credit in the same PR.

## Reference integrity

Every logical asset id has a declared owner: `committed` (a single's shipped URL, resolves on a clean clone), `provisioned` (a pack index entry whose GLB is fetched by `assets pull <source>`), or `dangling` (nothing owns it — a broken contract). Resolve one id with `resolveProvenance(id)`; gate a set of references with `validateAssetReferences(refs)`, which fails on any dangling reference and reports the exact `assets pull <source>` steps a clean checkout still needs. `assets provenance <id>...` exposes the same contract on the CLI and exits non-zero on a dangling id. This resolves references structurally against the catalog — never grep source text as the long-term contract.

A game's catalog is `buildCatalog(...)` over the generated pack index, singles, and aliases; `extras` is its durable escape hatch for assets that aren't in a pack. An editor asset import into a **promoted** game project writes into that `extras` array in `src/game/assets.ts` (bytes land in `public/<basePath>/imported/`), registered after packs (last-writer-wins) and before aliases (so an alias can target one — see `jgengine-editor`). At runtime an extra resolves to exactly its `{ url }`; the `label` is human-facing only and never enters the catalog.

At load time the shell classifies a model fetch before parsing via `classifyAssetResponse` (`@jgengine/core/scene/assetDiagnostics`), so a missing file, a dev-server HTML fallback, corrupt bytes, or a non-model format surface as an actionable diagnostic naming the URL — not an opaque GLTF parse error.

Reindex measures every GLB's `dims`; assets listed in `COLLISION_MESH_ASSET_IDS` (`collisionMeshAssets.ts`) additionally ship a compact quantized triangle mesh (`collisionMesh` on the index entry) that collider auto-fit raycasts instead of the fitted box — opt in only concave models whose box lies (archways, rings, frames), because each entry adds real index bytes and per-ray BVH cost. Reindex also records every GLB's animation `clips` (names read from the JSON chunk via `readGlbClips`), which flow through `buildCatalog` onto the resolved `ModelAssetRef` — the editor's browser badges rigged assets from it.

## Rigged assets animate by default

A model resolved from a catalog string id is stamped `animation: "auto"`: the shell derives speed-driven `idle`/`walk`/`run` states plus `hit`/`death`/`attack` one-shots from the loaded GLB's own clip names via semantic clip roles (`@jgengine/core/game/clipRoles` — `classifyClip`, `defaultAnimationForClips`, exported `DEFAULT_CLIP_ROLE_TABLE` covering KayKit/Quaternius/Mixamo naming). No game-side clip strings needed; a clipless model is unaffected. An explicit `ModelConfig.animation`/`style.animation` always wins, and `animation: "none"` opts a placement back to the bind pose. Games rendering cloned scenes themselves get the same driver from `@jgengine/shell/render/useModelAnimation` instead of hand-rolling an `AnimationMixer`.

## Source rules

- Never use or reference Kenney.nl assets.
- Prefer Quaternius or KayKit for CC0 3D, game-icons.net for icons, and ambientCG for PBR.
- Preserve third-party license and attribution data with the catalog entry.
- A permissive source allows copying assets, not transplanting another game's implementation.

## Traps

- Fix wrong scale/facing/pivot upstream in catalog metadata, never with per-game corrective transforms.
- Asset ids and metadata are stable data contracts; filenames and URLs are implementation details.
- Missing attribution is a release blocker even when the code works.

