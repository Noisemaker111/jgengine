/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { runGenerator } from "@jgengine/core/generator/generator";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount, useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { registerGeneratorPreview, type GeneratorPreviewProps } from "@jgengine/core/generator/generatorPreview.draw";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "@jgengine/core/scene/sceneKindRenderers.draw";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";
import { COURSE_OUTPUT } from "./courseGenerator";
import { COURSE_KIND, resolveCourseObject } from "./courseKind";
import { buildCourseLayout, type CourseLayout } from "./courseLayout";
import { buildRoadRibbon, type RoadPoint } from "./roads";
import { mergeRibbonGeometry } from "./RoadRibbons.draw";
import { MAIN_ROUTE, type RouteCourse } from "./routeCourse";
import { streetLayersDraw, type StreetPreviewLayer } from "./streetNetworkPreview.draw";

const HAZARD_COLOR: Readonly<Record<string, string>> = { timed: "#e8692b", lane: "#2bb5a8", surface: "#9a7b2d" };

function isLayout(value: unknown): value is CourseLayout {
  return typeof value === "object" && value !== null && "spec" in value && "slots" in value && Array.isArray(value.slots);
}

/**
 * A course's flat top-down layers: the main line, the shortcuts, hazard spans by role, barricades
 * as bars across the road (green jump, red block) and drops as short dashes. `shift` moves every
 * point (the variant tile centres the footprint). @internal
 */
export function courseLayers(layout: CourseLayout, course: RouteCourse = buildCourseLayout(layout), shift: readonly [number, number] = [0, 0]): StreetPreviewLayer[] {
  const at = (route: string, s: number, offset = 0): RoadPoint => {
    const point = course.pointAt(route, s, offset);
    return [point.x + shift[0], point.z + shift[1]];
  };
  const along = (route: string, from: number, to: number, offset = 0): RoadPoint[] => {
    const points: RoadPoint[] = [];
    for (let s = from; s < to; s += 2) points.push(at(route, s, offset));
    points.push(at(route, to, offset));
    return points;
  };
  const main = course.routes.find((route) => route.id === MAIN_ROUTE)!;
  const layers: StreetPreviewLayer[] = [
    { lines: [{ points: along(MAIN_ROUTE, 0, main.length), width: layout.spec.halfWidth * 2 }], color: "#4a4d52", lift: 0.05 },
    {
      lines: course.routes.filter((route) => route.id !== MAIN_ROUTE).map((route) => ({ points: along(route.id, 0, route.length), width: (layout.spec.branches?.find((branch) => branch.id === route.id)?.halfWidth ?? layout.spec.halfWidth) * 2 })),
      color: "#8a6d3b",
      lift: 0.07,
    },
  ];
  for (const role of Object.keys(HAZARD_COLOR)) {
    const lines = layout.slots
      .filter((slot) => slot.kind === "hazard" && slot.role === role && slot.to !== undefined)
      .map((slot) => {
        const route = slot.route ?? MAIN_ROUTE;
        const band = slot.band ?? [-course.pointAt(route, slot.at).halfWidth, course.pointAt(route, slot.at).halfWidth];
        return { points: along(route, slot.at, slot.to!, (band[0] + band[1]) / 2), width: band[1] - band[0] };
      });
    layers.push({ lines, color: HAZARD_COLOR[role]!, lift: 0.09 });
  }
  for (const [role, color] of [["jump", "#2fa84f"], ["block", "#c8382d"]] as const) {
    const lines = layout.slots
      .filter((slot) => slot.kind === "gate" && slot.role === role)
      .map((slot) => {
        const route = slot.route ?? MAIN_ROUTE;
        const hw = course.pointAt(route, slot.at).halfWidth;
        return { points: [at(route, slot.at, -hw), at(route, slot.at, hw)], width: 2.5 };
      });
    layers.push({ lines, color, lift: 0.11 });
  }
  const drops = layout.slots
    .filter((slot) => slot.kind === "drop")
    .map((slot) => ({ points: along(slot.route ?? MAIN_ROUTE, slot.at - 1, slot.at + 1, slot.offset ?? 0), width: 1.6 }));
  layers.push({ lines: drops, color: "#f2c230", lift: 0.12 });
  return layers;
}

/** A course layout takes a few milliseconds to lay, so a tile's frame and draw share one. */
const laid = new WeakMap<GeneratorPreviewProps["variant"], CourseLayout | null>();

function variantLayout({ definition, variant }: GeneratorPreviewProps): CourseLayout | null {
  const known = laid.get(variant);
  if (known !== undefined) return known;
  const output = runGenerator(definition, variant.meta);
  const layout = isLayout(output) ? output : null;
  laid.set(variant, layout);
  return layout;
}

function footprint(variant: GeneratorPreviewProps["variant"]): [number, number] {
  const width = variant.params["width"];
  const depth = variant.params["depth"];
  return [typeof width === "number" ? width / 2 : 240, typeof depth === "number" ? depth / 2 : 240];
}

function coursePreviewDraw(props: GeneratorPreviewProps): EngineDraw {
  const layout = variantLayout(props);
  const [halfX, halfZ] = footprint(props.variant);
  // The course starts at the footprint's near edge; the tile centres the footprint.
  return streetLayersDraw(layout === null ? [] : courseLayers(layout, undefined, [0, -halfZ]), halfX, halfZ);
}

function CoursePreview(props: GeneratorPreviewProps) {
  const latest = useRef(props);
  latest.current = props;
  useEngineDraw(() => coursePreviewDraw(latest.current), [props.definition, props.variant]);
  return null;
}

/** One placed course as a plain road ribbon riding the course's own elevation, unless its `drawRoad` is off. */
function courseRoadDraw(object: SceneKindObject): EngineDraw {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  let layout: CourseLayout | null = null;
  try {
    layout = object.meta?.["drawRoad"] === false ? null : resolveCourseObject(object);
  } catch {
    layout = null;
  }
  if (layout !== null) {
    const course = buildCourseLayout(layout);
    const ribbons = course.routes.map((route) => {
      const hw = route.id === MAIN_ROUTE ? layout!.spec.halfWidth : (layout!.spec.branches?.find((branch) => branch.id === route.id)?.halfWidth ?? layout!.spec.halfWidth);
      const elevation = (x: number, z: number): number => course.locate(x, z).elevation;
      return buildRoadRibbon(route.points, hw * 2, elevation, { elevation: route.id === MAIN_ROUTE ? 0.05 : 0.08, maxSegmentLength: 4 });
    });
    const geometry = mergeRibbonGeometry(ribbons);
    if (geometry !== null) {
      const material = new THREE.MeshStandardMaterial({ color: "#3d3a36", roughness: 0.95 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      group.add(mesh);
      disposables.push(geometry, material);
    }
  }
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const item of disposables) item.dispose();
    },
  };
}

function CourseRoad({ object }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  const latest = useRef(object);
  latest.current = object;
  return <EngineDrawMount create={() => courseRoadDraw(latest.current)} deps={[object]} />;
}

let registered = false;

/**
 * Registers the course generator's variant-tile preview (the layout seen from above: road,
 * shortcuts, hazards by role, barricades and drops) and the `course` kind's road renderer. Loaded on
 * demand with the kind. @internal
 */
export function registerCourseDraw(): void {
  if (registered) return;
  registered = true;
  registerGeneratorPreview(COURSE_OUTPUT, {
    Component: CoursePreview,
    frame: ({ variant }) => {
      const [halfX, halfZ] = footprint(variant);
      return { target: [0, 0, 0] as const, distance: Math.max(halfX, halfZ) * 2.6 };
    },
  });
  registerSceneKindRenderer(COURSE_KIND, ({ objects, context }) => (
    <>
      {objects.map((object) => (
        <CourseRoad key={object.id} object={object} context={context} />
      ))}
    </>
  ));
}
