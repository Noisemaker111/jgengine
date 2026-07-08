---
name: jgengine-assets
description: Use when sourcing or wiring art for a JGengine game — license-safe (CC0) 3D models, textures, HUD icons, and audio, which packs to pull, and how to wire them through the engine seams so no placeholder primitives or graybox ground ship.
---

# JGengine — Real assets from day one

Squares as enemies, colored boxes as buildings, and a flat grid floor read as *broken*, not unfinished. Art is not a later phase: the blueprint's **Asset plan** names the packs before the first edit, and the pass ends with zero default-material primitives visible.

## Sources

All CC0 (public domain, commercial use, no attribution) unless noted:

| Source | What you get |
|--------|--------------|
| [Kenney.nl](https://kenney.nl) | 40,000+ CC0 assets: characters, buildings, nature, vehicles, weapons, UI, audio, input prompts — the broadest single library |
| [Quaternius](https://quaternius.com) | CC0 low-poly packs: post-apocalyptic, medieval, sci-fi, animals, cars, dungeons, **rigged + animated characters** |
| [KayKit](https://kaylousberg.itch.io) | CC0 rigged/animated character packs (adventurers, skeletons), dungeon/city/nature kits, halloween/medieval sets |
| [Poly Haven](https://polyhaven.com) | CC0 PBR textures, HDRIs (skies/lighting), scanned models — ground materials and atmosphere |
| [ambientCG](https://ambientcg.com) | CC0 PBR materials: terrain, asphalt, walls, metal — the floor should come from here or Poly Haven, never a flat color |
| [Poly Pizza](https://poly.pizza) | Search engine over thousands of CC0 low-poly models when you need one specific thing |
| [Game-Icons.net](https://game-icons.net) / Kenney UI packs | 4,000+ weapon/item/ability **icon silhouettes** for the HUD (Game-Icons is CC BY 3.0 — credit it; Kenney's icon packs are CC0). Use these for hotbar/inventory/ability slots — never a colored box or letter |
| [itch.io CC0 3D tag](https://itch.io/game-assets/assets-cc0/tag-3d) / [OpenGameArt](https://opengameart.org) | Deep long-tail; **check the license per asset** — CC0 filter first |
| [Mixamo](https://www.mixamo.com) | Free humanoid animations (Adobe license — fine for shipped games, not CC0) |
| Kenney audio / [freesound CC0 filter](https://freesound.org) | Hit sounds, UI clicks, ambience |

## Rules

1. **One style family per game.** Kenney + Quaternius + KayKit low-poly mix fine; low-poly models on photoreal PBR ground reads broken. Name the family in the blueprint.
2. **License discipline.** CC0 needs nothing; anything else gets a line in `src/game/assets-credits.md` (source, author, license). Never ship an asset you can't name the license of.
3. **Wire through the engine seams.** GLB models go in the game's `src/game/assets.ts` render catalog keyed by catalog id; billboarded characters/enemies use the `entitySprites` field of `defineGame({...})`, real GLB meshes use its `entityModels` / `objectModels` fields; ground materials and skies belong to the world layer. Catalog `model` fields reference asset keys — never file paths scattered through game logic. Source models through **`@jgengine/assets`** (`buildCatalog({ basePath })` → resolve ids/aliases → urls); `pull` the packs into your app's `public/models/`. Kenney kits share one `Textures/colormap.png` that every GLB references relative to itself; `pull` extracts that shared `Textures/` folder alongside the GLBs, so the models render textured with no hand-copy step. In a network-restricted environment, `pull` falls back through `--mirror <baseUrl>` / `JGENGINE_ASSETS_MIRROR` (archive expected at `<baseUrl>/<provider>/<source-id>.zip`) before the provider's own URL, and `assets pull <source-id> --offline` fails fast instead of hanging when a dir isn't already populated — see its README for the full fallback order and the add/import flow.
4. **Coverage follows the content budget.** Every entity family, placed object, and held item in your catalogs maps to a real asset *before* the catalog entry ships. If the pack lacks a model, restyle the noun to one it has (a "sentry bot" becomes a "scrap golem" if that's the model you own) — rename the fantasy, don't ship a cube.
5. **Scale/pivot sanity.** Check each model against its catalog `footprint` on first placement; one wrong pivot repeated 100 times is a rebuild. Modular kits are authored on a 1-unit grid with **inconsistent pivots** — furniture/floors/walls are usually corner-pivot, nature props usually center-pivot — so a raw `object.place` misaligns tiles by half a cell, flings rotated walls off their edge, and floats furniture above the floor. You do **not** compute this by hand: `@jgengine/assets` measures each model's footprint, center, and `minY` at reindex and ships them on the catalog entry (`catalog.resolve(id).dims`); the shell reads them and, with `objectModels` anchor `"center"` (the default), horizontally centers the footprint on the placement point and ground-snaps the lowest vertex to it. So `object.place(id, cellX, y, cellZ, { rotation })` renders centered + grounded for any rotation — place on cell centers, no pivot math, no `dimensions.ts`. Use anchor `"origin"` only to opt back into the raw GLB origin.
6. **Item and ability icons are assets too.** Every hotbar / inventory / ability slot renders a real, **distinct** icon — a weapon/item sprite or a Game-Icons silhouette — so the bar is readable at a glance. A gray box, the item's first letter, an emoji, or one generic shape reused for everything is a placeholder, not an icon; it falls under the policy below exactly like a graybox enemy does.

## Placeholder policy

Primitive stand-ins are allowed only *mid-pass* as scaffolding. The pass does not end while any default-material primitive, unstyled ground plane, or debug grid is visible in the staged screenshot — **and this includes 2D HUD art**: a first-letter tile, emoji, or generic shape in a hotbar/item slot is a placeholder just as much as a gray capsule enemy is. If it would ship gray — or as a letter, an emoji, or the same shape for every item — it doesn't ship.
