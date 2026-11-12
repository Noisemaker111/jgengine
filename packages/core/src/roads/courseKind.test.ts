import { describe, expect, test } from "bun:test";

import { getGenerator } from "@jgengine/core/generator/generator";
import { runGenerator } from "@jgengine/core/generator/generator";
import { COURSE_GENERATOR } from "@jgengine/core/roads/courseGenerator";
import { COURSE_KIND, coursePiecesFromData, coursePiecesToData, registerCourseKind, resolveCourseObject } from "@jgengine/core/roads/courseKind";
import { buildCourseLayout, checkCoursePlayability } from "@jgengine/core/roads/courseLayout";
import { MAIN_ROUTE } from "@jgengine/core/roads/routeCourse";
import { onDemandSceneKindsFor, sceneKindNeeds } from "@jgengine/core/scene/onDemandSceneKinds";
import { getSceneKind } from "@jgengine/core/scene/sceneKinds";

describe("course scene kind", () => {
  test("an authored course resolves at the marker's pose, branch via points turning with it", () => {
    const meta = {
      halfWidth: 8,
      pieces: [{ straight: 100 }, { turn: 90, radius: 30, tag: "bend" }, { straight: 60, rise: 3 }],
      branches: [{ id: "cut", from: 80, to: 170, via: [[20, 120]], halfWidth: 5, data: { label: "CUT" } }],
      slots: [{ id: "g1", kind: "gate", role: "jump", at: 50 }, { id: "h1", kind: "hazard", role: "timed", at: 20, to: 30, cycle: { period: 8, active: 3 } }],
      startLine: 10,
      finish: 190,
    };
    const here = resolveCourseObject({ id: "a", kind: COURSE_KIND, position: { x: 0, y: 2, z: 0 }, meta })!;
    const turned = resolveCourseObject({ id: "a", kind: COURSE_KIND, position: { x: 500, y: 2, z: -40 }, rotationY: Math.PI / 2, meta })!;
    const a = buildCourseLayout(here);
    const b = buildCourseLayout(turned);
    expect(b.length).toBeCloseTo(a.length, 6);
    // Turned a quarter left about the start: local +z ahead becomes world +x.
    const pa = a.pointAt(MAIN_ROUTE, 150);
    const pb = b.pointAt(MAIN_ROUTE, 150);
    expect(pb.x).toBeCloseTo(500 + pa.z, 3);
    expect(pb.z).toBeCloseTo(-40 - pa.x, 3);
    expect(pb.elevation).toBeCloseTo(pa.elevation, 6);
    const cutA = a.routes.find((route) => route.id === "cut")!;
    const cutB = b.routes.find((route) => route.id === "cut")!;
    expect(cutB.length).toBeCloseTo(cutA.length, 6);
    expect(turned.spec.branches![0]!.data).toEqual({ label: "CUT" });
    expect(here.startLine).toBe(10);
    expect(b.spansAt(b.locate(b.pointAt(MAIN_ROUTE, 25).x, b.pointAt(MAIN_ROUTE, 25).z), 1, "hazard")).toHaveLength(1);
    expect(coursePiecesToData(coursePiecesFromData(meta.pieces)!)).toEqual(meta.pieces);
  });

  test("a generated course is the generator's layout at the marker, with pins over its slots", () => {
    const meta = {
      theme: "causeway",
      seed: "kind",
      pins: [
        { id: "gate-2", at: 300 },
        { id: "hazard-1", remove: true },
        { id: "container-drop", kind: "gate", role: "block", at: 520, data: { dropsAt: 24 } },
      ],
    };
    const object = { id: "c", kind: COURSE_KIND, position: { x: 100, y: 0, z: 100 }, rotationY: 0.4, meta };
    const layout = resolveCourseObject(object)!;
    const generated = runGenerator(COURSE_GENERATOR, meta);
    expect(layout.spec.pieces).toEqual(generated.spec.pieces);
    expect(layout.spec.start).toEqual({ x: 100, z: 100, heading: 0.4, elevation: 0 });
    expect(layout.slots.find((slot) => slot.id === "gate-2")).toMatchObject({ at: 300, pinned: true });
    expect(layout.slots.some((slot) => slot.id === "hazard-1")).toBe(false);
    expect(layout.slots.find((slot) => slot.id === "container-drop")).toMatchObject({ kind: "gate", at: 520, pinned: true, data: { dropsAt: 24 } });
    expect(checkCoursePlayability(resolveCourseObject({ ...object, meta: { theme: "causeway", seed: "kind" } })!).ok).toBe(true);
    // Without a seed the marker's id seeds it, so two markers differ.
    const first = resolveCourseObject({ id: "one", kind: COURSE_KIND, position: { x: 0, y: 0, z: 0 } })!;
    const second = resolveCourseObject({ id: "two", kind: COURSE_KIND, position: { x: 0, y: 0, z: 0 } })!;
    expect(JSON.stringify(first.spec.pieces)).not.toBe(JSON.stringify(second.spec.pieces));
  });

  test("a scene with a course marker loads the course system on demand, which registers kind and generator", () => {
    const needs = sceneKindNeeds({ markers: [{ kind: COURSE_KIND }], volumes: [], paths: [] });
    expect(onDemandSceneKindsFor(needs).map((entry) => entry.id)).toEqual(["course"]);
    registerCourseKind();
    expect(getSceneKind(COURSE_KIND)?.generator).toBe("course");
    expect(getGenerator("course")?.output).toBe("course");
    const note = getSceneKind(COURSE_KIND)!.note!({ id: "n", kind: COURSE_KIND, position: { x: 0, y: 0, z: 0 }, meta: { seed: "n" } }, {});
    expect(note).toMatch(/^generated · \d+ m · 1 shortcuts · 5 gates · 5 hazards · playable/);
  });
});
