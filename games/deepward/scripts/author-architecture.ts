/** Places Deepward's modular architecture (wall bays, ribs, columns, gantries, pipe runs) as editor markers.
 * Run once from the repo root with `bun games/deepward/scripts/author-architecture.ts`; the runtime reads only the export.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createEditorHost } from "@jgengine/editor/session";
import { deriveRoomPresentation, isBayWall, wallLength, WALL_BAY_WIDTH } from "../src/game/roomPresentation";
import { STRATUM_ORDER } from "../src/game/strata";
const PLACES = ["home", ...STRATUM_ORDER];

const scenePath = new URL("../src/editor.scene.json", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("../public/models/imported/deepward/architecture/asset-manifest.json", import.meta.url), "utf8"));
const { session, api, dispose } = createEditorHost({ gameId: "deepward", layers: JSON.parse(readFileSync(scenePath, "utf8")), assets: manifest.models.map((m: { id: string; url: string }) => ({ id: m.id, label: m.id, kind: "model", url: m.url })) });
for (const marker of session.getState().document.markers.filter((m) => m.kind === "deepward-architecture")) session.dispatch({ type: "remove", id: marker.id });
const doc = session.getState().document;
let n = 0;
function place(placeName: string, model: string, x: number, y: number, z: number, rotationY: number, scale = 1, replaces: string[] = []): void {
  const entry = manifest.models.find((m: { id: string }) => m.id === `deepward/architecture/${model}`);
  if (!entry) throw Error(model);
  const id = `arch-${placeName}-${model}-${++n}`;
  const r = api.handle({ method: "add_marker", id, kind: "deepward-architecture", x, y, z, rotationY, label: model, meta: { place: placeName, model, scale, replaces } });
  if (!r.ok) throw Error(JSON.stringify(r));
  session.dispatch({ type: "setMarker", id, patch: { catalogId: entry.id } });
}
const WALL_MODEL: Record<string, string> = { home: "wall-bay-3p9", vault: "wall-bay-3p9", cold: "wall-bay-4p4", wells: "wall-bay-4p2", choir: "wall-bay-6" };
const TURN_Z = (side: number) => (side > 0 ? -Math.PI / 2 : Math.PI / 2);
const TURN_X = (side: number) => (side > 0 ? Math.PI : 0);
const T = 0.22;
for (const placeName of PLACES) {
  const { surfaces, floorY } = deriveRoomPresentation(placeName as never); // type-escape: authoring script indexes its own fixed tables
  for (const s of surfaces.filter(isBayWall)) {
    const side = Number(s.id.split(":")[4]);
    const length = wallLength(s), count = Math.ceil(length / WALL_BAY_WIDTH);
    const stride = count === 1 ? 0 : (length - WALL_BAY_WIDTH) / (count - 1);
    for (let i = 0; i < count; i++) {
      const along = count === 1 ? 0 : -length / 2 + WALL_BAY_WIDTH / 2 + i * stride;
      if (s.axis === "z") place(placeName, WALL_MODEL[placeName]!, s.at[0] - side * (T / 2), floorY, s.at[2] + along, TURN_Z(side)); // type-escape: authoring script indexes its own fixed tables
      else place(placeName, WALL_MODEL[placeName]!, s.at[0] + along, floorY, s.at[2] - side * (T / 2), TURN_X(side)); // type-escape: authoring script indexes its own fixed tables
    }
  }
}
const label = (v: { label?: string }, name: string) => v.label === name;
const structure = doc.volumes.filter((v) => v.kind === "deepward-structure");
const placeOf = (v: { meta?: Record<string, unknown> }) => String(v.meta?.["place"]);
for (const v of structure.filter((v) => label(v, "spine-rib"))) place(placeOf(v), "rib-3p9", v.center.x, 0, v.center.z, 0, 1, ["spine-rib"]);
for (const v of structure.filter((v) => label(v, "spine-lintel"))) place(placeOf(v), "gantry-span", v.center.x, v.center.y - 0.25, v.center.z, 0, 1, ["spine-lintel"]);
for (const v of structure.filter((v) => label(v, "printer-pillar"))) place(placeOf(v), "column-6", v.center.x, 0, v.center.z, 0, 1, ["printer-pillar", "pillar-head", "pillar-cap", "pillar-glow"]);
const PIPES = ["service-header", "pipe-riser", "ink-main", "spine-conduit", "frost-pipe", "frost-header", "choir-conduit", "manifold-branch", "manifold-header", "sanctum-cable"];
for (const v of structure.filter((v) => v.shape === "cylinder" && PIPES.includes(v.label ?? ""))) {
  const radius = v.radius ?? 0.1, length = v.height ?? 1, name = placeOf(v);
  const turnX = Number(v.meta?.["turnX"] ?? 0), turnZ = Number(v.meta?.["turnZ"] ?? 0);
  const axis = Math.abs(turnZ) > 0.1 ? "x" : Math.abs(turnX) > 0.1 ? "z" : "y";
  const scale = Math.min(radius / 0.2, length / 4);
  const module = 4 * scale, count = Math.max(1, Math.ceil(length / module - 1e-6)), stride = count === 1 ? 0 : (length - module) / (count - 1);
  for (let i = 0; i < count; i++) {
    const along = count === 1 ? 0 : -length / 2 + module / 2 + i * stride;
    if (axis === "y") place(name, "pipe-stand", v.center.x, v.center.y - length / 2 + (count === 1 ? (length - module) / 2 : i * stride), v.center.z, 0, scale, [v.label!]); // type-escape: authoring script indexes its own fixed tables
    else if (axis === "x") place(name, "pipe-run", v.center.x + along, v.center.y, v.center.z, Math.PI / 2, scale, [v.label!]); // type-escape: authoring script indexes its own fixed tables
    else place(name, "pipe-run", v.center.x, v.center.y, v.center.z + along, 0, scale, [v.label!]); // type-escape: authoring script indexes its own fixed tables
  }
}
writeFileSync(scenePath, session.exportJson(true).replace(/\r\n/g, "\n") + "\n");
console.log(api.handle({ method: "scene_summary" }), n);
dispose();
