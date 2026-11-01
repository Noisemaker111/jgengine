/** Yard dressing for Row Six: the wreck walls past the barriers and the ground's oil stains and tyre marks.
 * Authored in the published editor session; runtime reads only the document.
 * Run from drift-foundry with `bun scripts/author-yard.ts`.
 */
import { createEditorHost } from "@jgengine/editor/session";
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../src/editor.scene.json", import.meta.url);
const { session, api, dispose } = createEditorHost({ gameId: "drift-foundry", layers: JSON.parse(readFileSync(path, "utf8")) });

for (const marker of session.getState().document.markers) if (marker.id.startsWith("d04-") || marker.id.startsWith("d05-")) session.dispatch({ type: "remove", id: marker.id });
const kept = session.getState().document.markers.map((marker) => marker.position);

let seed = 20261101;
const random = (): number => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
};

function add(id: string, kind: string, x: number, z: number, rotationY: number, meta: Record<string, unknown>, catalogId?: string): void {
  const result = api.handle({ method: "add_marker", id, kind, x, z, rotationY, ...(catalogId === undefined ? {} : { catalogId }), meta });
  if (!result.ok) throw new Error(JSON.stringify(result));
}

const clear = (x: number, z: number): boolean => kept.every((at) => at === undefined || Math.hypot(at.x - x, at.z - z) > 7);

/** Wreck walls: two courses of junk each side so no bare ground shows past the barriers. The inner course is
 * low hulls and dumpsters; the outer one stacks containers, heaps and appliances behind it. */
const INNER = ["prop_wreck_pile", "prop_dumpster", "prop_stripped_car", "prop_tire_wall"];
const OUTER = ["prop_container_stack", "prop_scrap_heap", "prop_appliance_stack", "prop_wreck_pile"];
let wall = 0;
for (const side of [-1, 1]) {
  for (let z = -30, i = 0; z <= 490; z += 9, i += 1) {
    const x = side * (23.6 + random() * 1.2);
    if (clear(x, z)) add(`d04-${++wall}-inner`, "prop", x, z + (side > 0 ? 4.5 : 0), random() * Math.PI * 2, { catalogId: INNER[(i + (side > 0 ? 1 : 0)) % INNER.length] }, INNER[(i + (side > 0 ? 1 : 0)) % INNER.length]);
  }
  for (let z = -24, i = 0; z <= 490; z += 14, i += 1) {
    const x = side * (30 + random() * 3);
    if (clear(x, z)) add(`d04-${++wall}-outer`, "prop", x, z, random() * Math.PI * 2, { catalogId: OUTER[(i + (side > 0 ? 2 : 0)) % OUTER.length] }, OUTER[(i + (side > 0 ? 2 : 0)) % OUTER.length]);
  }
}

/** Ground decals: twin tyre marks along the racing line and oil stains off it, plus the hazard apron at the launch. */
let ground = 0;
add(`d05-${++ground}-apron`, "decal", 0, 12, 0, { style: "hazard", size: 14, opacity: 0.75, seed: "launch-apron" });
for (let z = 30; z < 470; z += 24) {
  for (const lane of [-2.4, 2.4]) add(`d05-${++ground}-tyre`, "decal", lane + (random() - 0.5) * 1.2, z + random() * 6, (random() - 0.5) * 0.12, { style: "scorch", size: 5 + random() * 2, opacity: 0.4, seed: `tyre-${ground}` });
}
for (let z = 20; z < 470; z += 22) {
  const side = random() < 0.5 ? -1 : 1;
  add(`d05-${++ground}-oil`, "decal", side * (4 + random() * 12), z + random() * 10, random() * Math.PI * 2, { style: "wet", size: 2.4 + random() * 2.4, opacity: 0.7, seed: `oil-${ground}` });
}

writeFileSync(path, session.exportJson(true) + "\n");
console.log(JSON.stringify(api.handle({ method: "scene_summary" })));
dispose();
