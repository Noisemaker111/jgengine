import { describe, expect, test } from "bun:test";
import { createEmptyEditorDocument } from "../editor/document";
import type { EditorDocument, EditorPath, EditorVolume } from "../editor/types";
import { getSceneKind } from "../scene/sceneKinds";
import { registerBuiltinSceneKinds } from "../scene/builtinSceneKinds";
import {
  applyNavAreas,
  NAV_AREA_KIND,
  NAV_LINK_KIND,
  navAreaAt,
  navAreaGeometry,
  navAuthoringFromDocument,
  navLinksFromDocument,
  validateNavAuthoring,
  type AuthoredNavLink,
} from "./navAuthoring";
import { createNavCrowd, type NavCrowdLinkEvent } from "./navCrowd";
import type { NavMeshData } from "./navMesh";
import { createNavRuntime } from "./navRuntime";
import { navTileFromGrid } from "./navTiles";

function area(id: string, center: [number, number, number], half: [number, number, number], meta: Record<string, unknown>): EditorVolume {
  return { id, kind: NAV_AREA_KIND, shape: "box", center: { x: center[0], y: center[1], z: center[2] }, halfExtents: { x: half[0], y: half[1], z: half[2] }, meta };
}

function link(id: string, from: [number, number, number], to: [number, number, number], meta: Record<string, unknown>): EditorPath {
  return { id, kind: NAV_LINK_KIND, points: [{ x: from[0], y: from[1], z: from[2] }, { x: to[0], y: to[1], z: to[2] }], meta };
}

function scene(volumes: EditorVolume[], paths: EditorPath[]): EditorDocument {
  return { ...createEmptyEditorDocument(), volumes, paths };
}

/** A 20 × 10 floor split by a wall at x 9..11 that leaves a gap only at the far end (z 8..10). */
function walledFloor(): NavMeshData {
  return navTileFromGrid({
    bounds: { min: [0, 0], max: [20, 10] },
    cellSize: 1,
    areaAt: (x, z) => (x >= 9 && x < 11 && z < 8 ? null : 0),
  });
}

function length(points: readonly (readonly [number, number, number])[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![2] - points[i - 1]![2]);
  return total;
}

describe("nav authoring schema", () => {
  test("reads valid areas and links and reports every invalid one by id", () => {
    const document = scene(
      [
        area("deck", [5, 0, 5], [5, 1, 5], { mode: "walkable", area: 2 }),
        area("crates", [3, 0, 3], [1, 1, 1], {}),
        area("round", [0, 0, 0], [1, 1, 1], { mode: "blocked" }),
        { ...area("ball", [0, 0, 0], [1, 1, 1], {}), shape: "sphere", halfExtents: undefined as never },
        area("lava", [0, 0, 0], [1, 1, 1], { mode: "lava" }),
        area("flat", [0, 0, 0], [0, 1, 1], {}),
        { id: "zone", kind: "zone", shape: "box", center: { x: 0, y: 0, z: 0 }, halfExtents: { x: 1, y: 1, z: 1 } },
      ],
      [
        link("door", [8.5, 0, 1], [11.5, 0, 1], { linkKind: "door", cost: 2 }),
        link("ladder", [0, 0, 0], [0, 3, 1], { linkKind: "ladder", bidirectional: false }),
        { id: "stub", kind: NAV_LINK_KIND, points: [{ x: 0, y: 0, z: 0 }] },
        link("same", [1, 0, 1], [1, 0, 1], {}),
        link("wormhole", [0, 0, 0], [4, 0, 0], { linkKind: "teleport" }),
        link("cheap", [0, 0, 0], [4, 0, 0], { cost: -5 }),
        { id: "road", kind: "road", points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] },
      ],
    );
    const authored = navAuthoringFromDocument(document);
    expect(authored.areas.map((entry) => entry.id)).toEqual(["deck", "crates", "round"]);
    expect(authored.areas[0]).toEqual({ id: "deck", mode: "walkable", area: 2, min: [0, -1, 0], max: [10, 1, 10], floorY: 0 });
    expect(authored.areas[1]!.mode).toBe("blocked");
    expect(authored.links).toEqual([
      { id: "door", kind: "door", from: [8.5, 0, 1], to: [11.5, 0, 1], bidirectional: true, cost: 2 },
      { id: "ladder", kind: "ladder", from: [0, 0, 0], to: [0, 3, 1], bidirectional: false },
    ]);
    expect(validateNavAuthoring(document).map((issue) => issue.id).sort()).toEqual(["ball", "cheap", "flat", "lava", "same", "stub", "wormhole"]);
    expect(navLinksFromDocument(document, (object) => object.id !== "door").map((entry) => entry.id)).toEqual(["ladder"]);
  });

  test("survives a save and reload of the scene document unchanged", () => {
    const document = scene(
      [area("pit", [4, 0, 4], [2, 1, 2], { mode: "blocked" })],
      [link("gap", [1, 0, 1], [7, 0.5, 1], { linkKind: "jump", bidirectional: true, cost: 3 })],
    );
    const reloaded = JSON.parse(JSON.stringify(document)) as EditorDocument;
    expect(navAuthoringFromDocument(reloaded)).toEqual(navAuthoringFromDocument(document));
    expect(navAuthoringFromDocument(reloaded).issues).toEqual([]);
  });

  test("registers both kinds as editor scene kinds with an inspector schema", () => {
    registerBuiltinSceneKinds();
    expect(getSceneKind(NAV_AREA_KIND)).toMatchObject({ target: "volume", addCategory: "Navigation" });
    expect(getSceneKind(NAV_LINK_KIND)).toMatchObject({ target: "path", pathShape: "line", addCategory: "Navigation" });
  });
});

describe("authored areas in the build", () => {
  const areas = navAuthoringFromDocument(
    scene(
      [
        area("mud", [5, 0, 5], [5, 1, 5], { mode: "walkable", area: 3 }),
        area("crates", [5, 0, 5], [1, 1, 1], { mode: "blocked" }),
        area("pier", [25, 0, 5], [5, 1, 5], { mode: "walkable" }),
      ],
      [],
    ),
  ).areas;

  test("navAreaAt blocks, includes and otherwise defers to the builder's own rule", () => {
    expect(navAreaAt(areas, 5, 5, 0)).toBeNull();
    expect(navAreaAt(areas, 2, 2, 0)).toBe(3);
    expect(navAreaAt(areas, 25, 5, null)).toBe(0);
    expect(navAreaAt(areas, 50, 50, null)).toBeNull();
    expect(navAreaAt(areas, 50, 50, 7)).toBe(7);
  });

  test("a grid-built tile leaves blocked areas out and walkable areas in", () => {
    const mesh = navTileFromGrid({
      bounds: { min: [0, 0], max: [30, 10] },
      cellSize: 1,
      areaAt: (x, z) => navAreaAt(areas, x, z, x < 10 ? 0 : null),
    });
    const runtime = createNavRuntime({ mesh });
    expect(runtime.raycast([2, 0, 5], [8, 0, 5])).toBe(false);
    expect(runtime.findPolygon([25, 0, 5])).not.toBeNull();
    const across = runtime.plan([2, 0, 5], [8, 0, 5])!;
    expect(across.partial).toBeUndefined();
    expect(length(across.points)).toBeGreaterThan(6.2);
    runtime.dispose();
  });

  test("applyNavAreas removes blocked polygons, stamps area ids and re-indexes links", () => {
    // A distinct id per 2 m cell keeps the grid from merging the floor into one polygon.
    const mesh = navTileFromGrid({ bounds: { min: [0, 0], max: [10, 10] }, cellSize: 2, areaAt: (x, z) => 10 + Math.floor(x / 2) + Math.floor(z / 2) * 5 });
    const withLink: NavMeshData = { ...mesh, links: [{ from: 0, to: mesh.polys.length - 1, cost: 1 }, { from: 1, to: 2 }] };
    const blocked = navAuthoringFromDocument(scene([area("hole", [1, 0, 1], [1, 1, 1], { mode: "blocked" }), area("tar", [9, 0, 9], [1, 1, 1], { mode: "walkable", area: 4 })], [])).areas;
    const applied = applyNavAreas(withLink, blocked);
    expect(applied.polys.length).toBe(mesh.polys.length - 1);
    expect(mesh.polys.length).toBe(25);
    expect(applied.areas?.filter((id) => id === 4).length).toBe(1);
    expect(applied.links).toEqual([{ from: 0, to: 1 }]);
  });

  test("navAreaGeometry emits an upward floor per walkable area and a closed box per blocked one", () => {
    const geometry = navAreaGeometry(areas);
    expect(geometry.positions.length / 3).toBe(4 + 8 + 4);
    expect(geometry.indices.length / 3).toBe(2 + 12 + 2);
    const [a, b, c] = geometry.indices;
    const p = (i: number) => [geometry.positions[i * 3]!, geometry.positions[i * 3 + 1]!, geometry.positions[i * 3 + 2]!];
    const [ax, ay, az] = p(a!);
    const [bx, by, bz] = p(b!);
    const [cx, cy, cz] = p(c!);
    const normalY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    expect(by - ay).toBe(0);
    expect(cy - ay).toBe(0);
    expect(normalY).toBeGreaterThan(0);
  });
});

describe("routing through authored links", () => {
  const from: [number, number, number] = [5, 0, 1];
  const to: [number, number, number] = [15, 0, 1];
  const door = (meta: Record<string, unknown>): AuthoredNavLink[] =>
    navLinksFromDocument(scene([], [link("hatch", [8.5, 0, 1], [11.5, 0, 1], { linkKind: "door", ...meta })]));

  test("takes the link when it is the shorter way and reports the crossing", () => {
    const runtime = createNavRuntime({ mesh: walledFloor(), links: door({ cost: 1 }) });
    const path = runtime.plan(from, to)!;
    expect(path.partial).toBeUndefined();
    expect(path.links).toHaveLength(1);
    const crossing = path.links![0]!;
    expect(crossing.link).toMatchObject({ id: "hatch", kind: "door", cost: 1 });
    expect(path.points[crossing.start]).toEqual([8.5, 0, 1]);
    expect(path.points[crossing.end]).toEqual([11.5, 0, 1]);
    expect(length(path.points)).toBeLessThan(12);
    runtime.dispose();
  });

  test("walks around when the link costs more than the detour", () => {
    const runtime = createNavRuntime({ mesh: walledFloor(), links: door({ cost: 100 }) });
    const path = runtime.plan(from, to)!;
    expect(path.partial).toBeUndefined();
    expect(path.links).toBeUndefined();
    expect(Math.max(...path.points.map((point) => point[2]))).toBeGreaterThanOrEqual(8);
    runtime.dispose();
  });

  test("a one-way link is only taken in its direction; a two-way one either way", () => {
    const oneWay = createNavRuntime({ mesh: walledFloor(), links: door({ cost: 1, bidirectional: false }) });
    expect(oneWay.plan(from, to)!.links).toHaveLength(1);
    expect(oneWay.plan(to, from)!.links).toBeUndefined();
    oneWay.dispose();
    const twoWay = createNavRuntime({ mesh: walledFloor(), links: door({ cost: 1 }) });
    expect(twoWay.links()).toHaveLength(2);
    expect(twoWay.plan(to, from)!.links![0]!.link.id).toBe("hatch");
    twoWay.dispose();
  });

  test("a crowd agent is told when it enters and leaves the link", () => {
    const runtime = createNavRuntime({ mesh: walledFloor(), links: door({ linkKind: "jump", cost: 1 }) });
    const events: NavCrowdLinkEvent[] = [];
    const crowd = createNavCrowd({ nav: runtime, speed: 3, onLink: (event) => events.push(event) });
    crowd.add("runner", { position: from, goal: to });
    for (let t = 0; t < 300 && !crowd.agent("runner")!.arrived; t += 1) crowd.tick(1 / 30);
    expect(crowd.agent("runner")!.arrived).toBe(true);
    expect(events.map((event) => `${event.agent}:${event.phase}:${event.link.id}:${event.link.kind}`)).toEqual([
      "runner:enter:hatch:jump",
      "runner:exit:hatch:jump",
    ]);
    expect(events[0]!.from).toEqual([8.5, 0, 1]);
    expect(events[0]!.to).toEqual([11.5, 0, 1]);
    crowd.dispose();
    runtime.dispose();
  });

  test("a re-plan in the middle of a crossing still closes it", () => {
    const runtime = createNavRuntime({ mesh: walledFloor(), links: door({ cost: 1 }) });
    const events: string[] = [];
    const crowd = createNavCrowd({ nav: runtime, speed: 3, onLink: (event) => events.push(event.phase) });
    crowd.add("runner", { position: from, goal: to });
    for (let t = 0; t < 300 && events.length === 0; t += 1) crowd.tick(1 / 30);
    expect(events).toEqual(["enter"]);
    const saved = crowd.snapshot();
    expect(saved.agents[0]!.crossing).toBe(true);
    crowd.setGoal("runner", [12, 0, 1]);
    crowd.plan("runner");
    expect(events).toEqual(["enter", "exit"]);
    crowd.restore(saved);
    expect(crowd.snapshot().agents[0]!.crossing).toBe(true);
    crowd.dispose();
    runtime.dispose();
  });
});
