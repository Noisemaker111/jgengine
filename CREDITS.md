# Credits

JGengine stands on the shoulders of open work by others.
This file records that debt and thanks the people whose projects shaped ours.

## achrefelouafi

Huge thanks to **[achrefelouafi](https://github.com/achrefelouafi)** (chiro
achrefelouafi). Four of JGengine's environment renderers — **procedural
buildings, water, rain, and snow** — were shaped from ideas, math, and shader
techniques in his MIT-licensed Three.js reference projects. Every one of them is
worth reading in full; they are clear, self-contained, and beautifully done.

| JGengine feature | Where it lives | Derived from (MIT) |
| --- | --- | --- |
| **Procedural buildings** | [`core/world/buildings.ts`](packages/core/src/world/buildings.ts), [`shell/structures/GeneratedBuilding.tsx`](packages/shell/src/structures/GeneratedBuilding.tsx) | [BuildingGeneratorThreeJS](https://github.com/achrefelouafi/BuildingGeneratorThreeJS) — a procedural Hong Kong building generator ported from a Blender geometry-nodes setup. Our seeded facade/roof kit (windows, awnings, AC units, clotheslines, storefronts, shutters, store signs, roof props, guardrails, corners) follows the component vocabulary and placement logic of his generator. |
| **Water** | [`core/world/water.ts`](packages/core/src/world/water.ts), [`shell/water/`](packages/shell/src/water) | [OceanThreejs](https://github.com/achrefelouafi/OceanThreejs) — a cinematic, physically based ocean renderer. Our Gerstner wave surface, crest/foam shading, and Fresnel water color draw directly on his ocean techniques. |
| **Rain** | [`shell/weather/RainField.tsx`](packages/shell/src/weather/RainField.tsx) | [RainSystemThreeJS](https://github.com/achrefelouafi/RainSystemThreeJS) — GPU-instanced rain. Our camera-following instanced rain volume is shaped from his system. |
| **Snow** | [`shell/weather/SnowField.tsx`](packages/shell/src/weather/SnowField.tsx) | [SnowSystemThreeJS](https://github.com/achrefelouafi/SnowSystemThreeJS) — a fully procedural snow studio with GPU-instanced snowfall. Our drifting, swaying snow volume is shaped from his system. |

A related nod: JGengine's grass field
([`shell/terrain/GrassField.tsx`](packages/shell/src/terrain/GrassField.tsx))
took cues from his [GrassSystemThreeJS](https://github.com/achrefelouafi/GrassSystemThreeJS).

These are ports and re-implementations, not copies: JGengine's versions are
renderer-agnostic (the wave math and building generator live in dependency-free
`@jgengine/core`), prop-driven, and stripped of the reference projects' GUI,
audio, post-processing, and app-specific scene setup. But the good ideas are
his. Each source project is MIT-licensed; go star them.

## Vladislav Kruteniuk (three-start)

JGengine's behaviour lifecycle stands on
**[three-start](https://github.com/vladkrutenyuk/three-start)** by
**[Vladislav Kruteniuk](https://x.com/vladkrutenyuk)** (MIT License,
Copyright (c) 2026 Vladislav Kruteniuk) — a minimal foundation layer for
Three.js: bootstrap, lifecycle, and a unified component model. Read it; it is
small, exact, and every ordering decision is deliberate.

| JGengine feature | Where it lives | Derived from three-start |
| --- | --- | --- |
| **Behaviour lifecycle** | [`core/behaviour/behaviour.ts`](packages/core/src/behaviour/behaviour.ts) | `Object3DBehaviour`'s hook set and exact activation ordering (`onAwake` once → `onEnable` → `onStart` once → `onUpdate` → `onDisable` → `onDestroy` always), the `activeSelf`/`activeInHierarchy` cascade that prunes at self-inactive descendants so reactivation restores per-child flags, the Unity-style two-pass bootstrap (awake all, then enable/start all) with the bootstrap gate that defers mid-bootstrap attachments so modules always subscribe to update dispatch first, and the lazy frame-subscription trick — a behaviour joins update dispatch only if it actually overrides `onUpdate` (prototype-identity check at activation). |
| **Typed module registry** | same file (`JGEngineRegister`, `RegisterField`, `BehaviourModule`) | The `ThreeStartRegister` declaration-merging pattern and `ContextModule`'s module lifecycle (awake/start before any behaviour, module updates dispatch first). |
| **Three.js binding** | [`shell/behaviour.ts`](packages/shell/src/behaviour.ts) | `Object3DBehaviour`'s render hooks riding the object's own `onBeforeRender`/`onAfterRender`. |

Ours is a re-implementation, not a copy: JGengine's lifecycle runs headless over
an id-keyed node tree in dependency-free `@jgengine/core` (no three.js, no
scene graph), keyed to entity ids, and it consciously diverges where three-start
documents gaps (reparenting and mid-bootstrap deactivation re-check effective
activity). The lifecycle model, its ordering guarantees, and the lazy-dispatch
idea are his. three-start is MIT-licensed; go star it.

## Game concepts

Some of the games in `Games/*` are our own take on someone else's idea. We
credit the originators here, in the game's on-screen HUD, and on its page at
jgengine.com/games/&lt;id&gt; (via the `credit` field in
[`apps/web/src/content/games.ts`](apps/web/src/content/games.ts)).

### Ethan Mollick — *The Annals*

**[The Annals](Games/annals)** grows from a prompt by
**[Ethan Mollick](https://x.com/emollick)** (@emollick), Associate Professor at
The Wharton School — his
**[annals-kingdom](https://github.com/emollick/annals-kingdom)**, a living
medieval kingdom that writes its own chronicle in a single HTML file. Our
version reimagines the same idea on the engine: monarchs reign and die,
caravans thread between settlements, and every event lands in a running
chronicle you can pause and speed through.

### Ethan Mollick — *Monument*

**[Monument](Games/monument)** is a full port of
**[Ethan Mollick](https://x.com/emollick)**'s (@emollick)
**[monument-brutalist-city-builder](https://github.com/emollick/monument-brutalist-city-builder)**
(MIT License, © 2026 Ethan Mollick) — a brutalist-architecture city toy where
you sculpt parametric megastructures with direct handles and watch the district
live through day and night, with no economy and no fail state. Our version
rebuilds it on the engine and promotes its parametric massing grammar (nine
compositions × six profiles) into `@jgengine/core/world/massing`, where every
future city game can reach it. The design, catalogs, formulas, and the
data-not-meshes architecture are his.

### Jay Sharma (radiumcoders) — *Commit Canopy*

**[Commit Canopy](Games/commit-canopy)** is inspired by
**[Isometric GitHub Contributions](https://github.com/radiumcoders/Isometric-Github-Contributions)**
([live](https://isometric-github-contributions.vercel.app)) by
**[Jay Sharma / radiumcoders](https://github.com/radiumcoders)** — a Three.js
web app that turns any GitHub profile into an interactive 3D isometric terrain.
Our take renders the contribution year as an orbitable block landscape you can
export as a shareable image, and mirrors the reference app's panel layout.

### Levy Street — *World of ClaudeCraft*

**[World of ClaudeCraft](Games/claudecraft)** is a port of
**[world-of-claudecraft](https://github.com/levy-street/world-of-claudecraft)**
by **[Levy Street](https://github.com/levy-street)** (MIT) — a from-scratch,
browser-based classic-era MMORPG built almost entirely with AI coding agents:
nine classes, three zones, dungeons, professions, PvP, and a deterministic
20 Hz simulation that doubles as a Gymnasium RL environment. Our version
rebuilds the core of that game on the engine's own primitives — the exact
movement, armor, and XP formulas, the class kits, the three zone bands
(Eastbrook Vale, Mirefen Marsh, Thornpeak Heights), the mob rosters and loot
tables, and the Gravecaller storyline down to Morthen in the Hollow Crypt —
credited on the game's HUD and on its page at jgengine.com/games/claudecraft.

### Classic games (Wave 1)

Fourteen genre-anchor classics in `Games/*` are our own builds of decades-old
game concepts — original code, art, and levels, but the mechanics trace back
to specific inventors and titles. Credited here, on each game's HUD, and (where
applicable) via the `credit` field in
[`apps/web/src/content/games.ts`](apps/web/src/content/games.ts).

| Game | id | Lineage |
| --- | --- | --- |
| **[2048](Games/slide-2048)** | `slide-2048` | **[Gabriele Cirulli](https://github.com/gabrielecirulli)**'s MIT-licensed **[2048](https://github.com/gabrielecirulli/2048)**, itself inspired by **Threes!** (Asher Vollmer) and **1024!**. |
| **[Brick Breaker](Games/brick-breaker)** | `brick-breaker` | Atari's **Breakout** (1976). |
| **[Paddle Duel](Games/paddle-duel)** | `paddle-duel` | Atari's **Pong** (1972), designed by Allan Alcorn. |
| **[Gem Cascade](Games/gem-cascade)** | `gem-cascade` | The match-3 genre: **Shariki** (Eugene Alemzhin, 1994) and **Bejeweled** (PopCap). |
| **[Crate Keeper](Games/crate-keeper)** | `crate-keeper` | **Sokoban** (Hiroyuki Imabayashi, Thinking Rabbit, 1982) — mechanics homage; levels are original. |
| **[Flag Sweep](Games/flag-sweep)** | `flag-sweep` | **Minesweeper** (Robert Donner & Curt Johnson, Microsoft, 1990). |
| **[Snake](Games/snake)** | `snake` | **Blockade** (Gremlin, 1976) and **Nokia Snake** (Taneli Armanto, 1997). |
| **[Klondike Solitaire](Games/klondike)** | `klondike` | Traditional Klondike patience, popularized by **Microsoft Solitaire** (Wes Cherry, 1990). |
| **[FreeCell](Games/freecell)** | `freecell` | **Paul Alfille**'s FreeCell (1978), popularized in digital form by **Jim Horne**. |
| **[Video Poker](Games/video-poker)** | `video-poker` | **Draw Poker** video cabinets (SIRCOMA/IGT, 1979). |
| **[15 Puzzle](Games/fifteen-slide)** | `fifteen-slide` | The **15 Puzzle**, popularized in the 1870s and long attributed to **Noyes Chapman**. |
| **[Blackjack](Games/blackjack)** | `blackjack` | Traditional casino Blackjack / Twenty-One. |
| **[Memory Match](Games/memory-match)** | `memory-match` | Traditional **Concentration**. |
| **[Pachinko Parlor](Games/pachinko-parlor)** | `pachinko-parlor` | Traditional Japanese **Pachinko**. |

### Classic games (Wave 2)

Sixteen more genre-anchor classics in `Games/*` are our own builds of decades-old
game concepts — original code, art, and levels, but the mechanics trace back to
specific inventors and titles. Credited here and on each game's HUD; all
lineages this wave are corporate or traditional, so none carry a `credit` field
in [`apps/web/src/content/games.ts`](apps/web/src/content/games.ts).

| Game | id | Lineage |
| --- | --- | --- |
| **[Spider Solitaire](Games/spider)** | `spider` | Traditional Spider Solitaire patience — genre homage. |
| **[Sudoku](Games/sudoku)** | `sudoku` | **Howard Garns**'s number-placement puzzle (1979), popularized by **Nikoli**. |
| **[Nonogram](Games/nonogram)** | `nonogram` | **Non Ishida** and **Tetsuya Nishio**'s independently invented picture-logic puzzle (1987). |
| **[Reversi](Games/reversi)** | `reversi` | **Lewis Waterman** and **John Mollett**'s **Reversi** (1883); modern Othello rules by **Goro Hasegawa**. |
| **[Four in a Row](Games/four-in-a-row)** | `four-in-a-row` | **Howard Wexler** and **Ned Strongin**'s **Connect Four** (1974). |
| **[Echo Lights](Games/echo-lights)** | `echo-lights` | **Ralph Baer** and **Howard Morrison**'s **Simon** (1978), itself after Atari's **Touch Me**. |
| **[Lights Out](Games/lights-out)** | `lights-out` | **Tiger Electronics**'s **Lights Out** (1995). |
| **[Peg Solitaire](Games/peg-solitaire)** | `peg-solitaire` | Traditional peg solitaire — genre homage. |
| **[Codebreaker](Games/codebreaker)** | `codebreaker` | **Mordecai Meirowitz**'s **Mastermind** (1970), itself after the pen-and-paper game **Bulls and Cows**. |
| **[Star Invaders](Games/star-invaders)** | `star-invaders` | **Tomohiro Nishikado**'s **Space Invaders**, Taito (1978). |
| **[Rock Blaster](Games/rock-blaster)** | `rock-blaster` | **Lyle Rains** and **Ed Logg**'s **Asteroids**, Atari (1979). |
| **[Road Hopper](Games/road-hopper)** | `road-hopper` | Konami's **Frogger** (1981). |
| **[Yacht Dice](Games/yacht-dice)** | `yacht-dice` | Traditional **Yacht**, popularized as **Yahtzee** (E.S. Lowe, 1956). |
| **[Mahjong Solitaire](Games/mahjong-solitaire)** | `mahjong-solitaire` | **Brodie Lockard**'s Mahjong solitaire (1981). |
| **[Bubble Burst](Games/bubble-burst)** | `bubble-burst` | Taito's **Puzzle Bobble** (1994). |
| **[Pinball](Games/pinball)** | `pinball` | Traditional solid-state pinball — genre homage. |
