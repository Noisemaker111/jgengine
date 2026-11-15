/** Store dressing for Aisle 9: the shelving runs past the walkway, the floor decals and the tiled launch apron.
 * Authored in the published editor session; runtime reads only the document.
 * Run from drift-foundry with `bun scripts/author-yard.ts`.
 */
import { createEditorHost } from "@jgengine/editor/session";
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../src/editor.scene.json", import.meta.url);
const { session, api, dispose } = createEditorHost({ gameId: "drift-foundry", layers: JSON.parse(readFileSync(path, "utf8")) });

for (const marker of session.getState().document.markers) if (marker.id.startsWith("d04-") || marker.id.startsWith("d05-")) session.dispatch({ type: "remove", id: marker.id });
const kept = session.getState().document.markers.map((marker) => marker.position);

let seed = 20261114;
const random = (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};

function add(id: string, kind: string, x: number, z: number, rotationY: number, meta: Record<string, unknown>, catalogId?: string): void {
  const result = api.handle({ method: "add_marker", id, kind, x, z, rotationY, ...(catalogId === undefined ? {} : { catalogId }), meta });
  if (!result.ok) throw new Error(JSON.stringify(result));
}

const clear = (x: number, z: number): boolean => kept.every((at) => at === undefined || Math.hypot(at.x - x, at.z - z) > 3.5);

/** What lines the aisle in each section: snack gondolas, then frozen cases, then the tall bulk shelving. */
const SNACKS = ["prop_gondola", "prop_gondola_b", "prop_gondola_c"];
const INNER = (z: number, i: number): string => (z < 150 ? SNACKS[i % SNACKS.length]! : z < 300 ? "prop_freezer" : "prop_gondola_tall");
/** The second course behind it, a block back: tall shelving with pallet stacks between. */
const OUTER = ["prop_gondola_tall", "prop_gondola_tall", "prop_pallet_stack", "prop_gondola_tall"];

/** Shelving runs: one unbroken course each side, long axis down the aisle, so no bare floor shows past the walkway. */
let wall = 0;
for (const side of [-1, 1]) {
  for (let z = -30, i = 0; z <= 490; z += 4.5, i += 1) {
    const x = side * 23.2;
    const id = INNER(z, i + (side > 0 ? 1 : 0));
    if (clear(x, z)) add(`d04-${++wall}-inner`, "prop", x, z, 0, { catalogId: id }, id);
  }
  for (let z = -24, i = 0; z <= 490; z += 9, i += 1) {
    const x = side * (32 + random() * 2);
    const id = OUTER[(i + (side > 0 ? 2 : 0)) % OUTER.length]!;
    if (clear(x, z)) add(`d04-${++wall}-outer`, "prop", x, z, id === "prop_pallet_stack" ? random() * Math.PI : 0, { catalogId: id }, id);
  }
}

/** Floor decals: cart-wheel scuffs down the walkway, spills off it, and hazard tape at the launch. */
let ground = 0;
add(`d05-${++ground}-apron`, "decal", 0, 12, 0, { style: "hazard", size: 14, opacity: 0.75, seed: "launch-apron" });
for (let z = 30; z < 470; z += 24) {
  for (const lane of [-2.4, 2.4]) add(`d05-${++ground}-scuff`, "decal", lane + (random() - 0.5) * 1.2, z + random() * 6, (random() - 0.5) * 0.12, { style: "scorch", size: 4 + random() * 2, opacity: 0.25, seed: `scuff-${ground}` });
}
for (let z = 20; z < 470; z += 22) {
  const side = random() < 0.5 ? -1 : 1;
  add(`d05-${++ground}-spill`, "decal", side * (4 + random() * 12), z + random() * 10, random() * Math.PI * 2, { style: "wet", size: 2.4 + random() * 2.4, opacity: 0.6, seed: `spill-${ground}` });
}

/** The launch apron and the walkway's worn edges are store tile, not yard soil. */
for (const volume of session.getState().document.volumes) {
  if (volume.kind !== "soil") continue;
  const result = api.handle({ method: "set_meta", id: volume.id, patch: { baseColor: "#d8d2c6", crackColor: "#bdb6a8", crackIntensity: 0.06, crackScale: 3 } });
  if (!result.ok) throw new Error(JSON.stringify(result));
}

writeFileSync(path, session.exportJson(true) + "\n");
console.log(JSON.stringify(api.handle({ method: "scene_summary" })));
dispose();
