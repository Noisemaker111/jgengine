---
name: jgengine-assets
description: Asset API: models, sprites, audio, catalogs, sourcing, attribution.
---

# jgengine-assets

## Assets — real art from day one

Squares as enemies, colored boxes as buildings, and a flat grid floor read as *broken*, not unfinished. The blueprint's **Asset plan** names the packs before the first edit; a pass does not end while any default-material primitive, unstyled ground plane, or debug grid is visible in the staged screenshot — and that includes 2D HUD art: a first-letter tile, emoji, or one generic shape reused per slot is a placeholder exactly like a graybox enemy. Primitive stand-ins are allowed only *mid-pass* as scaffolding.

**One command — `assets add <query>`.** Don't memorize which of six systems owns a thing. Ask for it by name and paste the wiring it prints; it fuzzy-searches *every* catalog at once — 3D models, whole packs, PBR materials, sprite/icon packs, the HUD component registry, and curated `game-icon` glyphs — and for a model, pack, material, or sprite pack it also pulls + reindexes so the id is live:

| You want… | Run | Reference it as |
|-----------|-----|-----------------|
| A 3D model (tree, astronaut) | `assets add astronaut --dir ../../apps/dev/public` | `catalog.resolve("kenney-space/astronautA")!.url` in an `entityModels`/`objectModels` seam |
| A whole style pack | `assets add nature --dir ../../apps/dev/public` | any pulled id (browse with `assets list --source kenney-nature`) |
| A PBR surface material (grass, rock, brick…) | `assets add grass --kind material --dir ../../apps/dev/public` | `buildMaterialCatalog({ basePath: "/materials" }).resolve("material/grass")!.maps` — hundreds of CC0 ambientCG materials, maps normalized to `color/normal/roughness/ao/displacement.jpg` |
| Bulk item/ability icons or UI sprites, not just one glyph | `assets add "game icons" --dir ../../apps/dev/public` | `buildSpriteCatalog({ basePath: "/sprites" }).resolve("gameicons-icons/sword")!.url` — ~4,000 CC BY 3.0 game-icons.net icons in one pull, plus Kenney's CC0 Game Icons/Input Prompts/UI Pack |
| A HUD component (health/mana bar, boss bar, inventory, dialogue…) | `assets add "mana bar"` → prints the `npx shadcn add …` line | `<VitalBar … />` from `@/components/ui/vital-bar` |
| One common item / ability icon glyph, zero pull | `assets add sword` | `<GameIcon name="sword" />` (or `iconForItemId`) — the curated 78-glyph set, checked first |

`--kind model|pack|material|component|icon|sprite|spritePack` disambiguates a broad query, `--json` emits the ranked matches, and `findAssets(query)` from `@jgengine/assets` is the same search in code. The HUD component + curated icon catalogs are the shadcn registry at `jgengine.com/r` — 70+ presentational and engine-bound widgets (`vital-bar`, `boss-bar`, `resource-orb`, `ability-action-bar`, `inventory-slot-grid`, `dialogue-panel`, …). Search before you build: the "mana pool component" almost certainly already exists.

**Sources** (CC0 — public domain, commercial use, no attribution — unless noted):

| Source | What you get |
|--------|--------------|
| [Kenney.nl](https://kenney.nl) | 40,000+ CC0 assets: characters, buildings, nature, vehicles, weapons, UI, audio — the broadest single library; its CC0 2D icon/UI packs (Game Icons, Input Prompts, UI Pack) pull via `assets add <name> --kind spritePack` same as the 3D kits |
| [Quaternius](https://quaternius.com) / [KayKit](https://kaylousberg.itch.io) | CC0 low-poly packs incl. **rigged + animated characters**: medieval, sci-fi, dungeons, animals, adventurers |
| [Poly Haven](https://polyhaven.com) / [ambientCG](https://ambientcg.com) | CC0 PBR textures, HDRIs, materials — the floor comes from here, never a flat color. ambientCG is indexed (`assets add <name> --kind material`); Poly Haven isn't wired in yet (tracked as an engine gap issue) |
| [Poly Pizza](https://poly.pizza) | Search engine over thousands of CC0 low-poly models for one specific thing; mixed CC0/CC-BY per model, so it's a one-off `assets add <url> --license …`, not a bulk pull |
| [Game-Icons.net](https://game-icons.net) (CC BY 3.0 — credit it) | ~4,000 item/ability **icon silhouettes**, indexed as one pullable pack — `assets add "game icons"` or `--kind spritePack` — resolved per-icon via `buildSpriteCatalog`; the curated `game-icon` registry item still covers common glyphs with zero pull |
| [jgengine HUD registry](https://jgengine.com/r) — this repo, `assets add <name>` | 70+ React **HUD components** (vital/boss/xp bars, resource orbs, unit frames, inventories, action bars, panels, menus) — the widget you're about to hand-roll already exists |
| [itch.io CC0 3D tag](https://itch.io/game-assets/assets-cc0/tag-3d) / [OpenGameArt](https://opengameart.org) | Long tail — **check the license per asset**, CC0 filter first; OpenGameArt licenses are mixed per-submission (some copyleft), not bulk-indexed |
| [Mixamo](https://www.mixamo.com) | Free humanoid animations (Adobe license — fine for shipped games, not CC0) |
| Kenney audio / [freesound CC0 filter](https://freesound.org) | Hit sounds, UI clicks, ambience |

**Rules:**

1. **One style family per game.** Kenney + Quaternius + KayKit low-poly mix fine; low-poly models on photoreal PBR ground reads broken. Name the family in the blueprint.
2. **License discipline.** CC0 needs nothing; anything else gets a line in `src/game/assets-credits.md` (source, author, license). Never ship an asset you can't name the license of.
3. **Wire through the engine seams.** GLB models live in the game's `src/game/assets.ts` render catalog keyed by catalog id; billboards via `entitySprites`, real meshes via `entityModels`/`objectModels` in `defineGame({...})`; ground/skies belong to the world layer. Catalog `model` fields reference asset keys — never file paths in game logic. A pulled PBR material (`buildMaterialCatalog(...).resolve(id)!.maps`) goes onto the ground via `terrain({ detail: { material: { maps, repeat? } } })` (blends with the procedural rock/sand/snow shader) or onto an untextured GLB via that model's `ModelConfig.material.maps` — never a raw `material.map = texture` hack in game code; `assets add <name> --kind material` prints both wirings. The fast path is **`assets add <query>`** (see "One command" above): it pulls + reindexes the pack and prints this exact wiring. Under the hood it's **`@jgengine/assets`** — `buildCatalog({ basePath })` → resolve ids/aliases → urls, with `pull` landing packs in your app's `public/models/` (extracting Kenney's shared `Textures/` alongside the GLBs so models render textured). Network-restricted: `pull`/`add` fall back through `--mirror <baseUrl>` / `JGENGINE_ASSETS_MIRROR`, and `--offline` fails fast — see the package README for the fallback order.
4. **Coverage follows the content budget.** Every entity family, placed object, and held item maps to a real asset *before* the catalog entry ships. If the pack lacks a model, restyle the noun to one it has — rename the fantasy, don't ship a cube.
5. **Scale/pivot sanity.** `@jgengine/assets` measures each model's footprint/center/`minY` at reindex and ships them on the catalog entry (`catalog.resolve(id).dims`); with `objectModels` anchor `"center"` (the default) the shell centers the footprint on the placement point and ground-snaps the lowest vertex — so `object.place(id, cellX, y, cellZ, { rotation })` renders centered + grounded with no pivot math and no `dimensions.ts`. Anchor `"origin"` opts back into the raw GLB origin. Check the first placement of each model against its catalog `footprint`; one wrong pivot repeated 100 times is a rebuild.
6. **Item and ability icons are assets too.** Every hotbar/inventory/ability slot renders a real, distinct icon — the registry `game-icon` catalog (`iconForItemId`/`iconForAction`) for common glyphs, or `assets add <name> --kind spritePack` to pull the full game-icons.net / Kenney icon set when the roster outgrows the curated 78 — per the UI quality bar's real-icons rule. `assets add <name>` finds the right one (glyph, sprite pack, or a whole HUD component) and prints the usage.
7. **Weapons/props ride the rig via `attachments`.** An `entityModels` `ModelConfig` takes `attachments: [{ slot, model, position?, rotation?, scale? }]` — `slot` is a bone/node name on the rig (e.g. `"handslot.r"`), `model` a catalog id or inline `ModelConfig`. The shell parents the attached model to that bone, so a sword or spellbook follows the hand through every animation clip; dual-wield is two attachments (`handslot.r`/`handslot.l`). A missing slot name warns and skips (the rest of the rig still renders). Pairs with `animation.oneShots` for held-weapon combat.

**Sprite reindex internals** — `assets pull <sprite-source> --dir <dir>` and `assets reindex-sprites <dir>/sprites` are built from `extractSpriteFiles` (download.ts), `keyFromSpriteFile` / `entryForSpriteFile` / `indexSpriteSourceDir` / `reindexSprites` / `resolveGeneratedSpritesDir` (the sprite reindex pipeline), and `spriteWiringSnippet` (the printed usage snippet) — call these directly only if you're extending the sprite pull/reindex pipeline itself, not from game code.

## Audio — samples or procedural synth

Wire sound through `defineGame({ audio: { sounds, buses?, music?, musicBus? } })`; trigger it from game code with `ctx.game.audio.play(id, at?)` (one-shot) and `ctx.game.audio.music(themeId | null, transpose?)` (crossfade the soundtrack). No per-game Web Audio glue — the shell owns the `AudioContext`, listener, and mix buses.

A `SoundDef` (`@jgengine/core/audio/audioFalloff`) is either a **sample** (`url`) or **procedural** (`synth`) — exactly one. A `SynthPatch` (`@jgengine/core/audio/synth`) is pure data: a list of `ToneVoice` (oscillator + 12ms-attack/exp-decay envelope, optional pitch `slideTo`) and `NoiseVoice` (filtered white-noise burst) voices, each with its own `delay`, summed into one cue — so a whole SFX bank is file-free, zero-weight, and unit-testable headless. Reach for procedural over samples when the cue is a synth blip/impact/zap (UI, spells, hits); use samples for recorded ambience/voice.

`audio.music` is a `Record<id, MusicTheme>` (`@jgengine/core/audio/music`): a `MusicTheme` is `{ bpm, bars, events, trim? }` where each `NoteEvent` is `{ beat, midi, dur, vel, inst }` and `inst` names a built-in instrument voice (strings/flute/harp/horn/choir/bell/piano/warDrum/…). The shell's `MusicDirector` runs the themes as crossfadeable layers on one reverb-fed graph with a lookahead scheduler; `ctx.game.audio.music(id)` fades between them (per-zone loops, a combat theme, silence on `null`). Compose loops as note data — never transplant another engine's audio nodes. Themes mix through the `music` bus (settings volume applies); one-shots through `sfx` (or any bus you declare). Set a bus `gain` to master a whole group (e.g. `sfx` at 0.32).

## Genre cheat sheet

