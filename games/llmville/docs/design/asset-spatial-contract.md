# Asset spatial contract

Every 3D prop in LLMville shares one coordinate frame. Level designers work in **integer grid cells** — never in 1.2 m math.

## The grid

**1 cell = 1 meter.** Footprints are whole cells: `{ width: 3, depth: 5 }` means a 3×5 rectangle.

You never multiply by 1.2. Grid coordinates are integers: `gridX: 2`, `gridZ: 4`.

## Compass / facing

```
        N (+Z)  toward tier front door
         ↑
         |
   W ←---+---→ E (+X)
         |
         ↓
        S (-Z)
```

| Value | Label | Facing |
| --- | --- | --- |
| **0** | **N** | North (+Z, toward door) |
| 1 | E | East (+X) |
| 2 | S | South (-Z) |
| 3 | W | West (-X) |

In map JSON use `"facing": "N"` (preferred) or `"gridRotation": 0`. Both mean the same thing.

## Debugging spatial problems

The #1 source of "objects clipping / wrong size / diagonal / out of map" is a mismatch between what you *think* the map data + model pivots do and what actually happens at runtime.

**Always use the spatial debug overlay in dev:**

- `?debug=room` or `?debug=spatial` or `?room=1`
- When the 3D builder is active (`/dev/build`), the debug visuals turn on automatically.

What it shows (drawn from the *exact same data* that builds walls/floor/decor):
- Exact floor rectangle
- All colliders (red)
- 1-meter grid with coordinate labels
- Front door marker
- For every decor item in the map: marker + floating label with the raw position/rotation/scale that was applied

Combined with:
- `?axes=1` — shows world axes
- `?frames=1` or `?debug=frames` — shows asset frame / intended footprint logic

This makes the "disconnect" visible instead of guessed.

If an object is 3× too big, it will be obvious against the 1m grid.
If it's diagonal, the marker orientation + label will show the rotation.
If it's out of the room, it will be outside the green outline.
If the model has one-sided textures, you will see it when walking around (the debug markers still help locate the intended place).

Use this first before touching model files or map JSON. It will tell you exactly where the data and the visual are diverging.

Build placement UI shows **Facing N** — not degrees.

## Authoring a new GLB

1. Y-up, meters, real-world scale.
2. Forward = +Z (North) in the raw file when possible.
3. Floor props: base centered, feet at Y = 0.
4. If the import faces +X or -Z, set `frame.sourceForward` in the catalog — not rotation in map JSON.

## Catalog entry

```typescript
garage_car: createAsset("Garage Car", "maps/garage-car", "…", {
  modelPath: "/models/maps/garage-car.glb",
  footprint: { width: 3, depth: 5 },   // 3×5 cells
  frame: {
    sourceForward: "+X",
    fitFootprint: true,   // measured from GLB at load — not catalog guesses
  },
}),
```

## Map JSON

```json
{
  "type": "model",
  "id": "garage_car",
  "modelKey": "garage_car",
  "gridX": 2,
  "gridZ": 3,
  "facing": "N",
  "footprint": { "width": 3, "depth": 5 }
}
```

- Positions in **grid cells** (`gridX`, `gridZ`) — not `-2.4` world meters.
- `"facing": "N"` at rotation 0 means nose toward the door.

## Debugging

| URL param | Shows |
| --- | --- |
| `?axes=1` | World axes (blue = North/+Z) |
| `?frames=1` | Footprint outline + forward arrow + N/E/S/W label |

## Code

- Compass: `packages/game/src/world/cardinal.ts`
- Grid: `packages/game/src/world/grid.ts` (`TILE_SIZE = 1`)
- Asset frames: `packages/game/src/world/assetFrame.ts`
- World builder DSL (author tiers in code): `packages/game/src/world/worldBuilder.ts` → `createRoom().placePerimeterWalls().placeProp(...).build()`. Per-tier builders in `packages/game/src/world/tierMaps/`. Code is the source of truth for migrated tiers; the loader in `tierMap.ts` calls `buildTierMap(tier)` and skips the JSON fetch.
