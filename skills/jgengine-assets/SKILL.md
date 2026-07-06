---
name: jgengine-assets
description: License-safe 3D models, textures, sprites, and audio for JGengine games.
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
| [itch.io CC0 3D tag](https://itch.io/game-assets/assets-cc0/tag-3d) / [OpenGameArt](https://opengameart.org) | Deep long-tail; **check the license per asset** — CC0 filter first |
| [Mixamo](https://www.mixamo.com) | Free humanoid animations (Adobe license — fine for shipped games, not CC0) |
| Kenney audio / [freesound CC0 filter](https://freesound.org) | Hit sounds, UI clicks, ambience |

## Rules

1. **One style family per game.** Kenney + Quaternius + KayKit low-poly mix fine; low-poly models on photoreal PBR ground reads broken. Name the family in the blueprint.
2. **License discipline.** CC0 needs nothing; anything else gets a line in `game/assets-credits.md` (source, author, license). Never ship an asset you can't name the license of.
3. **Wire through the engine seams.** GLB models go in the game's `assets.ts` render catalog keyed by catalog id; billboarded characters/enemies use `PlayableGame.entitySprites`, real GLB meshes use `PlayableGame.entityModels` / `objectModels`; ground materials and skies belong to the world layer. Catalog `model` fields reference asset keys — never file paths scattered through game logic. Source models through **`@jgengine/assets`** (`buildCatalog({ basePath })` → resolve ids/aliases → urls); `pull` the packs into your app's `public/models/`. See its README for the add/import flow and `packages/games/asset-showcase` for a worked example.
4. **Coverage follows the content budget.** Every entity family, placed object, and held item in your catalogs maps to a real asset *before* the catalog entry ships. If the pack lacks a model, restyle the noun to one it has (a "sentry bot" becomes a "scrap golem" if that's the model you own) — rename the fantasy, don't ship a cube.
5. **Scale/pivot sanity.** Check each model against its catalog `footprint` on first placement; one wrong pivot repeated 100 times is a rebuild.

## Placeholder policy

Primitive stand-ins are allowed only *mid-pass* as scaffolding. The pass does not end while any default-material primitive, unstyled ground plane, or debug grid is visible in the staged screenshot. If it would ship gray, it doesn't ship.
