# Add the minimap to an existing React game

Use this recipe when a React game already owns its entities in an array, ECS
query, Zustand/Redux-style store, or another observable collection. JGengine
only needs a display view of those records; do not copy them into a
`MarkerSet`.

## Install

Keep the React and React DOM versions already used by the project, then add the
two focused JGengine packages:

```sh
bun add @jgengine/core @jgengine/react
```

The minimap imports neither Three.js nor React Three Fiber and does not require
`GameProvider`.

## Static entity arrays

Project an existing array directly. Keep the array stable with the same memo or
selector the project already uses.

```tsx
import { useMemo } from "react";
import { Minimap } from "@jgengine/react/map";

interface Unit {
  id: string;
  x: number;
  z: number;
  team: "ally" | "enemy";
}

export function MapHud({
  units,
  cameraTarget,
}: {
  units: readonly Unit[];
  cameraTarget: { x: number; z: number };
}) {
  const markers = useMemo(
    () =>
      units.map((unit) => ({
        id: unit.id,
        position: [unit.x, 0, unit.z] as const,
        kind: unit.team,
      })),
    [units],
  );

  return (
    <Minimap
      markers={markers}
      center={[cameraTarget.x, cameraTarget.z]}
      worldRadius={120}
      className="game-minimap"
    />
  );
}
```

Only `id` and `position` are required. `kind`, `label`, `heading`, and `meta`
are optional display data; lifecycle timestamps are not part of this view.

## Observable external store

Create the adapter once per store. The source caches its projected marker array
until the external store emits, so React snapshot reads do not remap the world
on every frame.

```tsx
import { useMemo } from "react";
import { createMarkerSource } from "@jgengine/core/world/markers";
import { Minimap } from "@jgengine/react/map";

interface Unit {
  id: string;
  x: number;
  z: number;
  team: string;
  name: string;
}

interface ExistingWorldStore {
  subscribe(listener: () => void): () => void;
  getState(): { units: readonly Unit[] };
}

export function ExistingGameMinimap({
  world,
  cameraTarget,
}: {
  world: ExistingWorldStore;
  cameraTarget: { x: number; z: number };
}) {
  const markers = useMemo(
    () =>
      createMarkerSource({
        subscribe: (listener) => world.subscribe(listener),
        getSnapshot: () => world.getState().units,
        project: (unit) => ({
          id: unit.id,
          position: [unit.x, 0, unit.z] as const,
          kind: unit.team,
          label: unit.name,
        }),
      }),
    [world],
  );

  return (
    <Minimap
      markers={markers}
      center={[cameraTarget.x, cameraTarget.z]}
      worldRadius={120}
    />
  );
}
```

For SSR, make the store's first client snapshot match the server snapshot. When
they differ structurally, pass `getServerSnapshot` to `createMarkerSource` and
read the same serialized initial units used to hydrate the external store.

## Ownership

The existing project still owns entities, updates, persistence, simulation,
camera, renderer, input, scheduling, and the subscription. JGengine owns only
the cached entity-to-marker projection, core world-to-map projection math, and
the React SVG presentation. Save and restore the project's unit state as usual;
markers are derived data and need no parallel save format.

Use `kindStyles`, `className`, and `style` to skin the production `Minimap`.
When the project owns every chrome element, compose `MinimapChrome` inside its
own SVG instead of adopting the framed default.

## Common traps

- Keep `getSnapshot()` array identity stable until `subscribe()` emits. This is
  the React external-store contract.
- Create `createMarkerSource` outside render or in `useMemo`; recreating it each
  render discards its projection cache.
- Pass world coordinates, not Three.js screen coordinates. Marker positions are
  `[x, y, z]`; the minimap projects X/Z.
- Do not poll the source from a render loop. Notify subscribers when the
  caller-owned collection changes.
- Do not add `createdAt` or `expiresAt` unless the project intentionally adopts
  `MarkerSet` lifecycle behavior.
