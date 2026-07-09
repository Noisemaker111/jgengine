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
