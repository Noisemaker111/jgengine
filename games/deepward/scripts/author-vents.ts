/** Places Deepward's damaged-machinery vents (steam, drips, sparks) as editor markers.
 * Run once from the repo root after `author-architecture.ts`: `bun games/deepward/scripts/author-vents.ts`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createEditorHost } from "@jgengine/editor/session";

const scenePath = new URL("../src/editor.scene.json", import.meta.url);
const { session, api, dispose } = createEditorHost({ gameId: "deepward", layers: JSON.parse(readFileSync(scenePath, "utf8")) });
for (const marker of session.getState().document.markers.filter((m) => m.kind === "deepward-vent")) session.dispatch({ type: "remove", id: marker.id });
const doc = session.getState().document;
let n = 0;
function vent(place: string, effect: string, x: number, y: number, z: number): void {
  const r = api.handle({ method: "add_marker", id: `vent-${place}-${effect}-${++n}`, kind: "deepward-vent", x, y, z, label: effect, meta: { place, effect } });
  if (!r.ok) throw Error(JSON.stringify(r));
}
const runs = doc.markers.filter((m) => m.kind === "deepward-architecture" && (m.label === "pipe-run" || m.label === "pipe-stand"));
const byPlace = new Map<string, typeof runs>();
for (const run of runs) byPlace.set(String(run.meta?.["place"]), [...(byPlace.get(String(run.meta?.["place"])) ?? []), run]);
for (const [place, list] of byPlace) {
  list.forEach((run, i) => {
    const p = run.position, scale = Number(run.meta?.["scale"] ?? 1), y = run.label === "pipe-stand" ? p.y + 2 * scale : p.y;
    if (i % 9 === 4) vent(place, "steam", p.x, y + 0.15, p.z);
    else if (i % 6 === 2) vent(place, "drip", p.x, y - 0.25 * scale, p.z);
  });
}
for (const box of doc.volumes.filter((v) => v.kind === "deepward-structure" && v.label === "junction-box").filter((_, i) => i % 3 === 0)) vent(String(box.meta?.["place"]), "spark", box.center.x, box.center.y + (box.halfExtents?.y ?? 0.2), box.center.z);
for (const head of doc.volumes.filter((v) => v.label === "hoist-head" || v.label === "hoist-head-east")) vent("vault", "spark", head.center.x, head.center.y - 0.25, head.center.z);
writeFileSync(scenePath, session.exportJson(true).replace(/\r\n/g, "\n") + "\n");
console.log(n, "vents");
dispose();
