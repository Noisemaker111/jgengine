---
name: jgengine-ui
description: React/shell UI API: HUDs, controls, feedback, accessibility, quality bar.
---

# jgengine-ui

## UI — `@jgengine/react`

The React layer — `GameProvider`, the hooks table, headless className-passthrough primitives (incl. map components), the identity/chat/voice/social/drag-layer kits, the shadcn registry install path for visual HUD components (`npx shadcn@latest add https://jgengine.com/r/<name>.json`), the screen-layout rule, and the **UI quality bar** (required, not optional polish). Full surface: **[../jgengine-ui/reference.md](../jgengine-ui/reference.md)**.

## Devtools — F2 overlay and tunables

`@jgengine/shell`'s `GamePlayerShell` mounts an F2-toggled debug overlay (`shell/src/devtools/DevtoolsOverlay.tsx`) over every game automatically — `defineGame({ devtools: false })` is the only way to turn the toggle off (default `true`). Five tabs:

| Tab | Shows |
|-----|-------|
| Perf | fps, frame/sim ms, draw calls, triangles, entity/object counts, state notifies/s, registered probes |
| Tune | every discovered tunable — checklist grouped by source file or table export name; check one to control it live |
| Logs | captured `console.log`/`info`/`warn`/`error` |
| Net | observed backend round-trip latency (fed by `instrumentLatency`) |
| Keys | the game's `ActionCodesMap` bindings |

**Tunables are zero-annotation.** Write plain code under `Games/<id>/src/**` — no import, no wrapper — and it's discoverable:

```ts
// loop.ts — top-level export const, nothing else
export const GRAVITY = -22;
export const SKY_COLOR = "#87ceeb";
export const GOD_MODE = false;

// game/content.ts — an exported flat table of numbers/booleans/colors
export const TUNING = { reach: 6, spawnRate: 0.4, fogColor: "#334455" };
```

The dev runner's Vite plugin, `tunableDiscoveryPlugin` (`@jgengine/core/devtools/transformTunables`, wired in `apps/dev/vite.config.ts`), rewrites each top-level `export const <number|boolean|"#hex">` literal to `export let` and binds it into the devtools registry as the module loads (`transformTunableExports` is the pure string transform underneath; `tunableModuleTable(id)` derives the table id from the file path, skipping `main.tsx` and `*.test.*`). Table exports need no transform at all — after each game module loads, the dev app calls `devtools.discover.scanModule(moduleExports)`, which walks every export's own properties for a flat plain-object table of numbers/booleans/`"#rrggbb"` strings.

F2 → Tune tab lists every discovered entry as a checklist, grouped by source file (top-level constants) or by table export name (object tables). Checking an entry hands it a live slider/toggle/color picker; unchecking resets it to its initial value. Kind is inferred from the value: `number` → slider, `boolean` → toggle, a `"#rgb"`/`"#rrggbb"`/`"#rrggbbaa"` string → color.

**Liveness.** An edit applies live wherever the code reads the constant/table entry at use time. A value captured once at init — passed into a function call, baked into worldgen — only picks up the new value on reload. Overrides persist in `localStorage` per game (key `jg-devtools:<game name>`) and are re-applied *before* `loop.onInit` runs, so even an init-baked constant respects its override after a refresh — *if* the read happens at or after `onInit`. A read that happens earlier than that (see below) never sees the override, reload or not.

**Default assumption: almost every gameplay number, boolean, and color is a tunable, not a hardcoded fact.** Walk speed, jump height, gravity, damage, cooldowns, spawn rates, drop chances, radii, durations, thresholds, multipliers, colors — if it's a scalar a designer would plausibly want to nudge while playing, it belongs in a place discovery can see (a top-level `export const`, or a direct scalar field on a catalog def object like `PlayerDef`/`EnemyDef`) — never buried as a bare literal inside a deeper nested object with no named export, and never computed once and thrown away. Treat "should this be tunable" as opt-out, not opt-in.

**Catalog-derived content must read fields live, not bake them at import time.** A common trap: a `content.ts` (or any module implementing `GameContextContent`) that loops over a catalog array *once at module scope* and copies scalar fields into a separately cached `Map`:

```ts
// WRONG — copies walkSpeed by value at import time, before devtools can even scan exports
const entityEntries = new Map<string, GameContextEntityEntry>();
for (const p of players) {
  entityEntries.set(p.id, { stats: p.stats, movement: { poses: p.poses, walkSpeed: p.walkSpeed } });
}
export const content: GameContextContent = {
  entityById: (id) => entityEntries.get(id) ?? null,
};
```

This runs during module import — earlier than `discoverGameTunables`/override-application in `apps/dev/src/main.tsx`, and earlier than any `loop.onInit`. The catalog object (`p`) still gets live-mutated by devtools, but nothing ever re-reads it, so the baked `walkSpeed` is permanently stale: no F2 edit and no persisted override ever reaches gameplay, reload or not.

```ts
// RIGHT — map ids to the catalog def itself; build the entry fresh on every lookup
const playersById = new Map(players.map((p) => [p.id, p]));
function entityById(id: string): GameContextEntityEntry | null {
  const p = playersById.get(id);
  return p === undefined ? null : { stats: p.stats, movement: { poses: p.poses, walkSpeed: p.walkSpeed } };
}
export const content: GameContextContent = { entityById };
```

Same shape, same call site — the only change is *when* `p.walkSpeed` is read: at lookup time (each spawn) instead of once at import. Objects (`stats`, `receive`) are already reference-safe to pass through either way; this only matters for scalars (numbers/booleans/strings) copied out of a catalog def.

**`tunable()` still exists — an optional low-level primitive, not the recommended path.** Reach for it only when you need explicit bounds, an `options` select, or a change subscription that discovery can't infer:

```ts
import { tunable } from "@jgengine/core/devtools/devtools";

const gravity = tunable("physics/gravity", -22, { min: -60, max: 0 });
```

Read `gravity.value` at use time (or `gravity.subscribe(listener)`) — never destructure once at module load. A `"group/label"` name (e.g. `"physics/gravity"`) groups the control under `group` in the Tune tab; `devtools.controls.register` is the same call underneath. Real example: `Games/voxel-mine/src/loop.ts` — `tunable("mining/reach", REACH, { min: 2, max: 16, step: 1 })`, read via a getter passed to `createEditorHandlers`.

**Agent loop.** The overlay's "Copy report" button copies a JSON `DevtoolsSnapshot`; from a browser session an agent can instead call `window.__JG_DEVTOOLS.snapshot()` directly (or `snapshotDevtools()` from game code) for the same shape — frame stats, render sample, latency stats, captured logs, probe values, every registered control's current + initial value, and a `discovered` array (`id`, `kind`, `value`, `enabled`) covering every auto-discovered tunable whether or not it's enabled — a single call to check "is this actually working" without a screenshot. `window.__JG_DEVTOOLS.discover` is exposed directly too (`list`/`enable`/`disable`/`bind`/`scanTable`/`scanModule`/`clear`) so an agent can flip a discovered tunable on and read/write it from the console without touching the UI.

`devtools.probes.register("name", () => value)` (`@jgengine/core/devtools/devtools`) surfaces a game-specific gauge (entity count, queue depth, whatever) in both the Perf tab and the snapshot; call the returned unregister function to remove it.

## Assets — real art from day one

