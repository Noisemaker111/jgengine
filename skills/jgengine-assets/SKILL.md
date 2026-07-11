---
name: jgengine-assets
description: JGengine asset API reference for models, sprites, textures, audio, catalog mappings, sourcing, style consistency, and attribution.
---

# jgengine-assets

## Assets — real art from day one

Squares as enemies, colored boxes as buildings, and a flat grid floor read as *broken*, not unfinished. The blueprint's **Asset plan** names the packs before the first edit; a pass does not end while any default-material primitive, unstyled ground plane, or debug grid is visible in the staged screenshot — and that includes 2D HUD art: a first-letter tile, emoji, or one generic shape reused per slot is a placeholder exactly like a graybox enemy. Primitive stand-ins are allowed only *mid-pass* as scaffolding.

**One command — `assets add <query>`.** Don't memorize which of four systems owns a thing. Ask for it by name and paste the wiring it prints; it fuzzy-searches *every* catalog at once — 3D models, whole packs, the HUD component registry, and `game-icon` glyphs — and for a model or pack it also pulls + reindexes so the id is live:

| You want… | Run | Reference it as |
|-----------|-----|-----------------|
| A 3D model (tree, astronaut) | `assets add astronaut --dir ../../apps/dev/public` | `catalog.resolve("kenney-space/astronautA")!.url` in an `entityModels`/`objectModels` seam |
| A whole style pack | `assets add nature --dir ../../apps/dev/public` | any pulled id (browse with `assets list --source kenney-nature`) |
| A HUD component (health/mana bar, boss bar, inventory, dialogue…) | `assets add "mana bar"` → prints the `npx shadcn add …` line | `<VitalBar … />` from `@/components/ui/vital-bar` |
| An item / ability icon | `assets add sword` | `<GameIcon name="sword" />` (or `iconForItemId`) |

`--kind model|pack|component|icon` disambiguates a broad query, `--json` emits the ranked matches, and `findAssets(query)` from `@jgengine/assets` is the same search in code. The HUD component + icon catalogs are the shadcn registry at `jgengine.com/r` — 70+ presentational and engine-bound widgets (`vital-bar`, `boss-bar`, `resource-orb`, `ability-action-bar`, `inventory-slot-grid`, `dialogue-panel`, …). Search before you build: the "mana pool component" almost certainly already exists.

**Sources** (CC0 — public domain, commercial use, no attribution — unless noted):

| Source | What you get |
|--------|--------------|
| [Kenney.nl](https://kenney.nl) | 40,000+ CC0 assets: characters, buildings, nature, vehicles, weapons, UI, audio — the broadest single library |
| [Quaternius](https://quaternius.com) / [KayKit](https://kaylousberg.itch.io) | CC0 low-poly packs incl. **rigged + animated characters**: medieval, sci-fi, dungeons, animals, adventurers |
| [Poly Haven](https://polyhaven.com) / [ambientCG](https://ambientcg.com) | CC0 PBR textures, HDRIs, materials — the floor comes from here, never a flat color |
| [Poly Pizza](https://poly.pizza) | Search engine over thousands of CC0 low-poly models for one specific thing |
| [Game-Icons.net](https://game-icons.net) (CC BY 3.0 — credit it) / Kenney UI packs (CC0) | 4,000+ item/ability **icon silhouettes** — the registry `game-icon` item covers common HUD glyphs first |
| [jgengine HUD registry](https://jgengine.com/r) — this repo, `assets add <name>` | 70+ React **HUD components** (vital/boss/xp bars, resource orbs, unit frames, inventories, action bars, panels, menus) — the widget you're about to hand-roll already exists |
| [itch.io CC0 3D tag](https://itch.io/game-assets/assets-cc0/tag-3d) / [OpenGameArt](https://opengameart.org) | Long tail — **check the license per asset**, CC0 filter first |
| [Mixamo](https://www.mixamo.com) | Free humanoid animations (Adobe license — fine for shipped games, not CC0) |
| Kenney audio / [freesound CC0 filter](https://freesound.org) | Hit sounds, UI clicks, ambience |

**Rules:**

1. **One style family per game.** Kenney + Quaternius + KayKit low-poly mix fine; low-poly models on photoreal PBR ground reads broken. Name the family in the blueprint.
2. **License discipline.** CC0 needs nothing; anything else gets a line in `src/game/assets-credits.md` (source, author, license). Never ship an asset you can't name the license of.
3. **Wire through the engine seams.** GLB models live in the game's `src/game/assets.ts` render catalog keyed by catalog id; billboards via `entitySprites`, real meshes via `entityModels`/`objectModels` in `defineGame({...})`; ground/skies belong to the world layer. Catalog `model` fields reference asset keys — never file paths in game logic. The fast path is **`assets add <query>`** (see "One command" above): it pulls + reindexes the pack and prints this exact wiring. Under the hood it's **`@jgengine/assets`** — `buildCatalog({ basePath })` → resolve ids/aliases → urls, with `pull` landing packs in your app's `public/models/` (extracting Kenney's shared `Textures/` alongside the GLBs so models render textured). Network-restricted: `pull`/`add` fall back through `--mirror <baseUrl>` / `JGENGINE_ASSETS_MIRROR`, and `--offline` fails fast — see the package README for the fallback order.
4. **Coverage follows the content budget.** Every entity family, placed object, and held item maps to a real asset *before* the catalog entry ships. If the pack lacks a model, restyle the noun to one it has — rename the fantasy, don't ship a cube.
5. **Scale/pivot sanity.** `@jgengine/assets` measures each model's footprint/center/`minY` at reindex and ships them on the catalog entry (`catalog.resolve(id).dims`); with `objectModels` anchor `"center"` (the default) the shell centers the footprint on the placement point and ground-snaps the lowest vertex — so `object.place(id, cellX, y, cellZ, { rotation })` renders centered + grounded with no pivot math and no `dimensions.ts`. Anchor `"origin"` opts back into the raw GLB origin. Check the first placement of each model against its catalog `footprint`; one wrong pivot repeated 100 times is a rebuild.
6. **Item and ability icons are assets too.** Every hotbar/inventory/ability slot renders a real, distinct icon — the registry `game-icon` catalog (`iconForItemId`/`iconForAction`) or a Game-Icons/Kenney silhouette — per the UI quality bar's real-icons rule. `assets add <name>` finds the glyph (or a whole HUD component) and prints the usage.

## Genre cheat sheet

