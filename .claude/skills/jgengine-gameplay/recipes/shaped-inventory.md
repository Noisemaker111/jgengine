# Place shaped inventory items

Use `@jgengine/core/inventory/shapedGrid` for discrete cell footprints, including
rectangles and irregular shapes. Item definitions, values, authored dimensions,
save schemas, drag controls, and presentation stay in the game.

```ts
import {
  createShapedGrid,
  findShapedPlacement,
  moveShaped,
  placeShaped,
  type ShapedItem,
} from "@jgengine/core/inventory/shapedGrid";

const item: ShapedItem<{ name: string }> = {
  id: "probe-7",
  value: { name: "Survey probe" },
  footprint: [[0, 0], [0, 1], [1, 1]],
};
const board = createShapedGrid<{ name: string }>(4, 3);
const fit = findShapedPlacement(board, item.footprint, {
  rotations: [0, 1],
  maxChecks: 24,
});
if (fit.status === "found") {
  const placed = placeShaped(board, item, fit.origin, fit.rotation);
  if (placed.status === "ok") moveShaped(placed.grid, item.id, [1, 0], 1);
}
```

Rotations are quarter turns. Search visits the supplied rotation order, then
rows and columns; the default rotation order is `[0, 1, 2, 3]`. Coordinates and
dimensions must be finite safe integers; dimensions are positive and footprints
are nonempty. Footprints normalize their minimum cell to `[0, 0]` after rotation.
`canPlace` reports invalid cells before bounds and overlap checks. Pass `ignoreId`
to either check or search when repositioning an existing item.

Search indexes current occupancy once and limits candidate origins to
`maxChecks` (default 4096). `budget-exceeded` means the search is incomplete;
`no-space` means every requested origin and rotation was checked. Do not report
a full bag for an exhausted budget. Indexing and footprint checks scale with
the caller's board data; the budget does not limit their cell count.

Placement operations return new board data. Serialize that data in the caller's
save format; the engine does not keep a parallel bag or impose item nouns.
Deepward's prepared adopter maps its existing rectangular item sizes and saved
`x`, `y`, `rotated` fields into this contract, preserving its `[0, 1]` rotation
preference and row-major packing. Its UI and extraction rules remain local.
The prepared patch waits for a coordinator-verified containing package release.
