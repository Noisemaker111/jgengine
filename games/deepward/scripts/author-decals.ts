/** Places Deepward's stencilled markings (line numbers, bay marks, hazard chevrons) as editor markers.
 * Run once from the repo root after `author-architecture.ts`: `bun games/deepward/scripts/author-decals.ts`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createEditorHost } from "@jgengine/editor/session";
import { ROOMS } from "../src/world";

const scenePath = new URL("../src/editor.scene.json", import.meta.url);
const { session, api, dispose } = createEditorHost({ gameId: "deepward", layers: JSON.parse(readFileSync(scenePath, "utf8")) });
for (const marker of session.getState().document.markers.filter((m) => m.kind === "deepward-decal")) session.dispatch({ type: "remove", id: marker.id });
const doc = session.getState().document;
let n = 0;
function decal(place: string, x: number, y: number, z: number, rotationY: number, meta: Record<string, unknown>): void {
  const r = api.handle({ method: "add_marker", id: `decal-${place}-${++n}`, kind: "deepward-decal", x, y, z, rotationY, label: String(meta["text"] ?? meta["style"]), meta: { place, opacity: 0.85, ...meta } });
  if (!r.ok) throw Error(JSON.stringify(r));
}
const LINE: Record<string, string> = { home: "L06", vault: "L06", cold: "L07", wells: "L08", choir: "L09" };
const AMBER = "#eab379", CYAN = "#84e8d0", BRASS = "#cca46c";
const floorY = (place: string) => doc.volumes.find((v) => v.kind === "deepward-room" && v.meta?.["place"] === place);
for (const place of ["home", "vault", "cold", "wells", "choir"]) {
  const base = floorY(place);
  if (!base) throw Error(place);
  const y = base.center.y - (base.halfExtents?.y ?? 0) + 0.03;
  const rooms = ROOMS.filter((room) => room.place === place);
  rooms.forEach((room, i) => {
    const size = Math.min(6, Math.min(room.w, room.d) * 0.8);
    if (size < 1.6) return;
    decal(place, room.x, y, room.z, 0, { style: "stencil", size, tilt: 0, text: `${LINE[place]}-${String(i + 1).padStart(2, "0")}`, color: place === "home" || place === "vault" ? CYAN : AMBER, seed: `${place}${i}` });
  });
  const bays = doc.markers.filter((m) => m.kind === "deepward-architecture" && m.meta?.["place"] === place && String(m.label).startsWith("wall-bay"));
  bays.forEach((bay, i) => {
    if (i % 4 !== 1) return;
    const yaw = bay.rotationY ?? 0;
    decal(place, bay.position.x + Math.sin(yaw) * 0.05, y + 2.1, bay.position.z + Math.cos(yaw) * 0.05, yaw, { style: "stencil", size: 1.7, tilt: 90, text: `B-${String(i + 1).padStart(2, "0")}`, color: BRASS, seed: `${place}b${i}` });
  });
}
const spine = ROOMS.find((room) => room.id === "room-return-spine");
if (spine) for (let z = spine.z - spine.d / 2 + 5; z < spine.z + spine.d / 2 - 3; z += 7) decal("vault", spine.x, 0.03, z, Math.PI, { style: "chevrons", size: 3.4, tilt: 0, color: AMBER, seed: `chev${z}` });
const receiving = ROOMS.find((room) => room.id === "room-rail-receiving");
if (receiving) for (const side of [-1, 1]) decal("vault", receiving.x + side * 2.6, 0.03, receiving.z, 0, { style: "chevrons", size: 3, tilt: 0, color: AMBER, seed: `rc${side}` });
writeFileSync(scenePath, session.exportJson(true).replace(/\r\n/g, "\n") + "\n");
console.log(n, "decals");
dispose();
