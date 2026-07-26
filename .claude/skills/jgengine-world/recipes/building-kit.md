# Recipe — dressing generated buildings with a model kit

**What this wires:** the facade generator already emits every part slot a
building needs — walls, windows, storefronts, awnings, roof clutter. A
`BuildingKit` binds those slots to real GLBs, so the same massing renders as
untextured blocks, as a clean prefab town, or as a ruin, purely by swapping the
bound art.

## Bind a pack to slots

```ts
import { defineBuildingKit } from "@jgengine/core/world/buildingKit";

const kit = defineBuildingKit({
  id: "settlement-clean",
  parts: {
    wall: ["/models/pack/Wall_Straight.glb", "/models/pack/Wall_Flat.glb"],
    window: ["/models/pack/Wall_Window.glb"],
    storefront: ["/models/pack/Door_Metal.glb"],
    airConditioner: [{ model: "/models/pack/Vent_Big.glb", fit: "contain" }],
  },
  omit: ["clothesline"],
});
```

A bare string is shorthand for `{ model }`. `fit` decides how the model meets
its slot box: `stretch` (default) fills the bay — right for tiling panels;
`contain` keeps a prop's proportions. `defineBuildingKit` throws on an empty
variant list, so a typo fails at authoring time instead of rendering nothing.

Resolve `model` through your game's asset catalog rather than typing URLs, and a
missing id fails at boot:

```ts
const url = assets.resolve("pack/Wall_Straight")?.url;
```

## Hand it to the world

```ts
import { building } from "@jgengine/core/world/features";

building({ position: [0, 0], count: 8, style: "desert", kit });
```

Kinds the kit leaves unbound keep the engine's untextured block, so a partial
kit is a valid kit — bind walls and windows first, add roof clutter later.
Kinds listed in `omit` render nothing at all: use it for parts the setting
rejects, not for parts you have not got around to.

## Two kits, one generator

Bind a second kit with broken panels and welded-shut doors, pass it to the
zones that should read as derelict, and the generator, seeds, and layout stay
identical. That split is the point of the seam — style is art binding, not a
second code path.

## Spread the seeded picks

The generator's `variants` counts decide which slot index each bay asks for. If
a kit binds a different number of models than the config assumes, picks wrap
unevenly and one wall model dominates. When you drive the generator directly,
feed the kit's own counts back in:

```ts
import { buildingKitVariantCounts } from "@jgengine/core/world/buildingKit";
import { generateBuilding } from "@jgengine/core/world/buildings";

generateBuilding({ seed: "town-1", variants: buildingKitVariantCounts(kit) });
```

## Common traps

- Do not bind `roof` to a wall-sized plate; the roof slot is one slab spanning
  the whole footprint, not a tiling bay.
- `contain` for anything that must not distort (vents, crates, signs);
  `stretch` for panels authored to fill a bay.
- `omit` and "unbound" are different outcomes — unbound still draws a block.
