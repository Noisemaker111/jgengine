# Overhead enemy nameplates and health bars

Use this recipe when a game needs floating world-anchored frames over entities —
enemy nameplates with a health bar, interaction prompts, objective pips. The
game keeps owning its entities; JGengine owns only the reusable behavior:
projecting a world position to the screen, offsetting above the head, culling
frames that are off-screen or behind the camera, and stacking nearer frames over
farther ones. You compose the frame markup itself from the shipped bars, so the
look is the game's, not a prefab.

The seam is data-first and caller-owned: pass an array of
`{ id, worldPosition, ... }` and a projector. Nothing is mirrored into a store.

## Install

```sh
bun add @jgengine/core @jgengine/react
# @jgengine/shell only for the R3F projection convenience below
bun add @jgengine/shell
```

`@jgengine/react/entityFrames` imports neither Three.js nor React Three Fiber and
needs no `GameProvider`. The `@jgengine/shell` piece is a thin R3F convenience.

## R3F game: one component from your own entity array

`WorldEntityFrames` mounts inside the R3F scene, samples the live camera each
frame, and renders the frames through a fullscreen overlay. Pass the entities you
already have and a `renderFrame` that composes the shipped `HealthBar` plus a
name. Projection, culling, and stacking come for free.

```tsx
import { WorldEntityFrames } from "@jgengine/shell/world/WorldEntityFrames";
import { HealthBar, barTokens } from "@jgengine/react/bars";

interface Enemy {
  id: string;
  name: string;
  position: [number, number, number];
  hp: number;
  maxHp: number;
}

export function EnemyNameplates({ enemies }: { enemies: readonly Enemy[] }) {
  const entries = enemies.map((e) => ({
    id: e.id,
    // Anchor over the head: lift the world Y by the entity's height.
    worldPosition: [e.position[0], e.position[1] + 2.2, e.position[2]] as const,
    enemy: e,
  }));

  return (
    <WorldEntityFrames
      entries={entries}
      maxCount={24} // keep the nearest 24 when a crowd is on screen
      renderFrame={({ enemy }) => (
        <div style={{ ...barTokens({ health: "#e5484d" }), textAlign: "center" }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#f1f5f9",
              textShadow: "0 1px 3px rgba(0,0,0,0.9)",
              whiteSpace: "nowrap",
            }}
          >
            {enemy.name}
          </span>
          <HealthBar value={enemy.hp} max={enemy.maxHp} width={78} showValue={false} shape="pill" />
        </div>
      )}
    />
  );
}
```

Reskin the whole set with one `HudTheme`/`barTokens` object on an ancestor —
health color, frame material, radius, and glow flow to every plate's `HealthBar`.
The `enemy` payload rides along on each entry, so `renderFrame` reads live values
without a second lookup.

## Non-R3F game: bring your own projector

Outside R3F (a 2D or custom-renderer game), use the headless
`EntityFrames` directly and pass a `project` that maps a world position to a
screen point — return `null`, or `{ behind: true }`, to cull an entry. `depth`
(larger = farther) drives stacking.

```tsx
import { EntityFrames, type ProjectEntity } from "@jgengine/react/entityFrames";
import { HealthBar } from "@jgengine/react/bars";

const project: ProjectEntity = (world) => {
  const screen = myCamera.worldToScreen(world); // your renderer's projection
  if (screen === null) return null; // outside the frustum → culled
  return { x: screen.x, y: screen.y, depth: screen.distance, behind: screen.behind };
};

export function Nameplates({ enemies }: { enemies: readonly Enemy[] }) {
  return (
    <EntityFrames
      entries={enemies.map((e) => ({ id: e.id, worldPosition: e.position, enemy: e }))}
      project={project}
      offsetY={-24}
      viewport={{ width: window.innerWidth, height: window.innerHeight }}
      renderFrame={({ enemy }) => (
        <HealthBar value={enemy.hp} max={enemy.maxHp} width={78} showValue={false} />
      )}
    />
  );
}
```

Mount either component inside `HudCanvas` (or any positioned ancestor) so the
overlay is bounded to the viewport.

## Ownership

The game still owns its entities, their positions, health, updates, camera, and
the render cadence. JGengine owns the projection→offset→cull→stack behavior
(`layoutEntityFrames`, unit-tested) and, for R3F, the camera→screen projector
(`useWorldProjection` / `projectWorldToScreen`). The frame markup is yours.

## Common traps

- Pass a fresh `entries` array each frame (or memo it on your live data). The
  component re-projects on the R3F frame loop; the pure `EntityFrames` re-projects
  whenever it re-renders.
- Lift `worldPosition` by the entity's height for an overhead anchor — the seam
  does not guess a height.
- Set `maxCount` for crowds so a battlefield of entities does not render hundreds
  of plates; the nearest are kept.
- Do not mirror entities into a `GameProvider`/entity store to use this. If the
  game *does* run the JGengine entity store, `WorldNameplates`
  (`@jgengine/shell/world/WorldHud`) is the store-driven counterpart.
- Keep `renderFrame` cheap — it runs per visible entity per refresh.
