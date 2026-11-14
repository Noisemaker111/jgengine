/** Aisle 9's authored landmarks: end-cap displays at the shelf ends, tall gondola crowns and the section clusters.
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

/** End-caps at the shelf ends, alternating sides just outside the drivable aisle: the edge reads at 100 km/h. */
const ENDCAPS = ["prop_endcap", "prop_cart_corral", "prop_endcap", "prop_wet_floor", "prop_endcap", "prop_box_pile"];
for (let index = 0, z = 26; z < 452; z += 26, index += 1) {
  prop(ENDCAPS[index % ENDCAPS.length]!, index % 2 === 0 ? -20.5 : 20.5, z, index * 0.7);
}
/** Section crowns: the tallest shelving stands where a shopper first sees each section. */
const CROWNS: Array<[number, number]> = [
  [-31, 58], [33, 76], [-30, 118],
  [-33, 182], [35, 214], [-30, 262],
  [-34, 322], [32, 356], [-31, 402], [36, 436],
];
for (const [x, z] of CROWNS) prop("prop_gondola_tall", x, z, 0, "section crown shelving");
/** Section seams: a pair of tall gondolas either side of the aisle where the floor changes. */
for (const z of [150, 300, 470]) for (const x of [-21.5, 21.5]) prop("prop_gondola_tall", x, z, 0);
/** Landmark clusters, one per section: the snack pallets, the frozen cases, the bulk racking. */
for (const [x, z] of [[-30, 84], [-34, 96], [30, 66]] as const) prop("prop_pallet_stack", x, z, 0.4);
for (const [x, z] of [[-29, 226], [-33, 238], [31, 232], [35, 246]] as const) prop("prop_freezer", x, z, 0);
for (let z = 312, index = 0; z < 452; z += 22, index += 1) {
  prop("prop_gondola_tall", index % 2 === 0 ? -29 : 29, z, 0);
  prop("prop_pallet_stack", index % 2 === 0 ? 30 : -31, z + 8, index * 0.5);
}

writeFileSync(path, session.exportJson(true) + "\n");
console.log(JSON.stringify(api.handle({ method: "scene_summary" })));
dispose();
