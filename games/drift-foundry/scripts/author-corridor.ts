/** D0.3 corridor content: authored landmarks and shoulder rhythm for Drift Foundry.
 * Authored in the published editor session; runtime reads only the document.
 * Run from drift-foundry with `bun scripts/author-corridor.ts`.
 */
import { createEditorHost } from "@jgengine/editor/session";
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../src/editor.scene.json", import.meta.url);
const { session, api, dispose } = createEditorHost({ gameId: "drift-foundry", layers: JSON.parse(readFileSync(path, "utf8")) });

const doc = session.getState().document;
for (const marker of doc.markers) if (marker.id.startsWith("d03-")) session.dispatch({ type: "remove", id: marker.id });

let placed = 0;
function prop(catalogId: string, x: number, z: number, turn = 0, label?: string) {
  const id = `d03-${++placed}-${catalogId.replace(/^prop_/, "")}`;
  const result = api.handle({ method: "add_marker", id, kind: "prop", catalogId, x, z, rotationY: turn, ...(label === undefined ? {} : { label }), meta: { catalogId } });
  if (!result.ok) throw new Error(JSON.stringify(result));
}

/** Alternating junk sentries just outside the fence line: the yard edge reads at 100 km/h. */
const SENTRY = ["prop_wreck_pile", "prop_tire_wall", "prop_dumpster", "prop_stripped_car", "prop_appliance_stack", "prop_scrap_heap"];
for (let index = 0, z = 26; z < 452; z += 26, index += 1) {
  prop(SENTRY[index % SENTRY.length]!, index % 2 === 0 ? -25.5 : 25.5, z, index * 0.7);
}
/** Zone crown: the tallest silhouettes sit where a driver first sees each yard. */
const TOWERS: Array<[number, number]> = [
  [-31, 58], [33, 76], [-30, 118],
  [-33, 182], [35, 214], [-30, 262],
  [-34, 322], [32, 356], [-31, 402], [36, 436],
];
for (const [x, z] of TOWERS) prop("prop_yard_tower", x, z, 0, "yard water tower");
/** Zone pylons: a crane-leg pair either side of the road at each yard seam. */
for (const z of [150, 300, 470]) for (const x of [-23.5, 23.5]) prop("prop_crane_leg", x, z, 0);
/** Landmark clusters inside the near wall band, one per yard. */
for (const [x, z, id] of [[-30, 84, "prop_container_stack"], [-34, 96, "prop_container_stack"], [30, 66, "prop_container_stack"]] as const) prop(id, x, z, 0.4);
for (const [x, z] of [[-29, 226], [-33, 238], [31, 232], [35, 246]] as const) prop("prop_appliance_stack", x, z, 0.9);
for (let z = 312, index = 0; z < 452; z += 22, index += 1) {
  prop("prop_crane_leg", index % 2 === 0 ? -29 : 29, z, 0);
  prop("prop_container_stack", index % 2 === 0 ? 30 : -31, z + 8, index * 0.5);
}

writeFileSync(path, session.exportJson(true) + "\n");
console.log(JSON.stringify(api.handle({ method: "scene_summary" })));
dispose();
