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

## Majid Manzarpour (threejs-game-skills)

The **[`references/visual-scorecard.md`](.claude/skills/jgengine-ui/references/visual-scorecard.md)** rubric in the `jgengine-ui` skill adapts the structure — a 0–3 scale, ten scored categories, premium/showcase pass thresholds, an automatic-failure list, and a fresh-eyes take-the-lower-score reconciliation — of `visual-scorecard.md` from **[threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills)** by **[Majid Manzarpour](https://x.com/majidmanzarpour)** (MIT License). Every category, threshold, and example is reworded for this engine's own terms (`environment()`, `AuthoredScene`, `InstancedScatter`, `summarizeEnvironment`) and none of the source repo's prose or assets were copied — only the rubric shape.

## Kay Lousberg (KayKit)

JGengine's `@jgengine/assets` catalog mirrors **[KayKit](https://kaylousberg.itch.io)**
packs by **[Kay Lousberg](https://kaylousberg.itch.io)** (CC0-1.0) —
GitHub-mirrored (`github.com/KayKit-Game-Assets`) `.glb` characters and props:
adventurers, skeletons, dungeon kits, a medieval hexagon pack, furniture,
city-builder bits, and space-base bits
([`packages/assets/src/sources/kaykit.ts`](packages/assets/src/sources/kaykit.ts)).
CC0 — no attribution required, credited here anyway. Go play his games.

## Quaternius

JGengine's `@jgengine/assets` catalog mirrors **[Quaternius](https://quaternius.com)**
megakits (CC0-1.0) — stylized nature, medieval village, downtown city, modular
sci-fi, fantasy props, base characters, animated animals, and monsters
([`packages/assets/src/sources/quaternius.ts`](packages/assets/src/sources/quaternius.ts)).
CC0 — no attribution required, credited here anyway. Broadest low-poly CC0
library around; go star it.

## game-icons.net (Ironhold HUD)

The **[Ironhold](Games/ironhold)** command-console HUD uses vector glyphs from
**[game-icons.net](https://game-icons.net)** (CC BY 3.0) for its resource, unit,
building, research, and ability icons
([`Games/ironhold/src/game/ui/iconData.ts`](Games/ironhold/src/game/ui/iconData.ts)).
The individual icons are by **Lorc**, **Delapouite**, and **sbed** — coins,
wood-pile, meat, despair, miner, broadsword, high-shot, crossed-swords, barracks,
wheat, watchtower, checkered-flag, palm, pointy-sword, breastplate,
lightning-branches, shield, boots, medal, stopwatch, and visored-helm. Recoloured
to gold via `currentColor`, otherwise unmodified. CC BY 3.0 — attribution given
here as required.

## Game and level design research

The `game-design` and `level-design` skills synthesize and rephrase design
methods from the following researchers and practitioners. No source prose,
diagrams, examples, or assets are copied; the skills adapt the concepts into
JGengine's editor-owned world and reusable-package workflow.

| Source | Concepts adapted |
| --- | --- |
| Hunicke, LeBlanc, and Zubek, [MDA](https://users.cs.northwestern.edu/~hunicke/MDA.pdf); Ryan and collaborators, [PENS](https://selfdeterminationtheory.org/player-experience-of-needs-satisfaction-pens/) | Causal experience framing and autonomy/competence/relatedness as motivation diagnostics |
| Joris Dormans, [Machinations research](https://ojs.aaai.org/index.php/AIIDE/article/view/12477); Daniel Cook, [The Chemistry of Game Design](https://www.gamedeveloper.com/design/the-chemistry-of-game-design) | Resource-flow, feedback-loop, action-feedback-learning, and skill-chain analysis |
| Hunicke and Chapman, [dynamic difficulty](https://users.cs.northwestern.edu/~hunicke/pubs/Hamlet.pdf); Valve, [Left 4 Dead AI systems](https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) | Challenge dimensions, adaptive pressure, intensity waves, and the distinction between pacing frequency and difficulty amplitude |
| Microsoft Games Studios, [RITE](https://jpattonassociates.com/wp-content/uploads/2015/04/rite_method.pdf); Microsoft, [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines) | Rapid verified playtest iteration and player-informed accessibility checks |
| GDC talks by [David Shaver and Robert Yang](https://www.gdcvault.com/play/1025360/Level-), [Jane Ng](https://www.gdcvault.com/play/1022409/Designing-for-Exploration-and-Choice), [Matt Thorson](https://www.gdcvault.com/play/1024307/Level-Design-Workshop-Designing-Celeste), [Jolie Menzel](https://www.gdcvault.com/play/1023139/Level-), [Andrew Yoder](https://gdcvault.com/play/1025183/Level-Design-Workshop-The-Holy), [Clemence Maurer](https://gdcvault.com/play/1024305/Level-Design-Workshop-Rewarding-Exploration), [Dave Feltham](https://gdcvault.com/play/1018166/Emotional-Journey-BioWare-s-Methods), [Matthias Worch](https://gdcvault.com/play/1020570/), and [Brendon Chung](https://www.gdcvault.com/play/1022117/level-design-in-a-day) | Graybox testing, spatial wayfinding, exploration, movement stages, puzzle diagnosis, multiplayer maps, narrative pacing, and informed spatial choice |

## Game concepts

Some of the games in `Games/*` are our own take on someone else's idea. We
credit the originators here, in the game's on-screen HUD, and on its page at
jgengine.com/games/&lt;id&gt; (via the `credit` field in
[`apps/web/src/content/games.ts`](apps/web/src/content/games.ts)).

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

### Classic games (Wave 2)

A handful of genre-anchor classics in `Games/*` are our own builds of decades-old
game concepts — original code, art, and levels, but the mechanics trace back to
specific inventors and titles. Credited here and on each game's HUD; all
lineages this wave are corporate or traditional, so none carry a `credit` field
in [`apps/web/src/content/games.ts`](apps/web/src/content/games.ts).

| Game | id | Lineage |
| --- | --- | --- |
| **[Vice Isle](Games/vice-isle)** | `vice-isle` | Rockstar Games's **Grand Theft Auto** series, in the cel-shaded look of Gearbox's **Borderlands** — genre homage. |
| **[Ironhold](Games/ironhold)** | `ironhold` | Blizzard Entertainment's **Warcraft III** — the base-and-army real-time-strategy skirmish (select, command, attack-move, focus-fire). Original code, art, and map; only the feel and verb set are harvested. |
