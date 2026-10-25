import { useMemo } from "react";
import { libraryModel } from "@jgengine/assets/catalogs/modelLibrary";
import type { ModelConfig } from "@jgengine/core/game/playableGame";
import type { ScatterInstance } from "@jgengine/core/world/scatterRegion";
import type { AuthoredSurfaceConfig } from "@jgengine/shell/render/authoredSurfaceMaterial";
import { InteriorDressing, PracticalLights } from "@jgengine/shell/render/InteriorDressing";
import { StaticShapeInstances, type StaticShapeInstance } from "@jgengine/shell/render/staticShapeInstances";
import { InstancedScatter } from "@jgengine/shell/scatter/InstancedScatter";

import { editorLayers, floorDressing } from "../world";
import { FLOOR_DEBRIS, FLOOR_PROPS } from "./interiorPlan";
import { blendTint, FLOOR_LOOK, librarySurface, type FloorLook } from "./interiorLook";
import { stationModelReplacements } from "./stationModels";
import { deriveRoomPresentation } from "./roomPresentation";
import { STRATA, type Stratum } from "./strata";

// Rooms are short sight lines: the lighter level takes over at 10 m, and clutter only receives
// shadows, so a floor of props neither doubles its triangles in the shadow pass nor draws scans afar.
const PROP_MODELS: Readonly<Record<string, ModelConfig>> = Object.fromEntries(
  [...new Set([...Object.values(FLOOR_PROPS).flat(), ...Object.values(FLOOR_DEBRIS).flat()])].map(name => [name, { ...libraryModel(name, { farDistance: 10 }), shadows: "receive" } satisfies ModelConfig]),
);
const resolveProp = (item: string): ModelConfig | null => PROP_MODELS[item] ?? null;

/** The room shell (floor slabs, ceilings, walls) and the ceiling lamp strips, in this floor's materials. */
export function shellShapes(stratum: Stratum, look: FloorLook = FLOOR_LOOK[stratum]): StaticShapeInstance[] {
  const room = deriveRoomPresentation(stratum);
  const lamp = STRATA[stratum].lamp.color;
  const lampLens: AuthoredSurfaceConfig = { color: "#ffffff", emissive: lamp, emissiveIntensity: 2.6, roughness: 0.4, metalness: 0 };
  const housing = look.dressing.housing;
  const shapes: StaticShapeInstance[] = room.surfaces.map(surface => ({
    shape: "box",
    position: surface.at,
    scale: surface.size,
    surface: surface.kind === "floor" ? look.floor : surface.kind === "ceiling" ? look.ceiling : look.wall,
    // Slabs only catch shadows; walls also throw them, so a lamp's light stops at the room it is in.
    shadows: surface.kind === "wall" ? "both" : "receive",
  }));
  for (const strip of room.lamps) {
    shapes.push({ shape: "box", position: [strip.fixture[0], strip.fixture[1] + 0.05, strip.fixture[2]], scale: [strip.width + 0.16, 0.1, 0.32], surface: housing, shadows: "none" });
    shapes.push({ shape: "box", position: [strip.fixture[0], strip.fixture[1] - 0.02, strip.fixture[2]], scale: [strip.width, 0.045, 0.2], surface: lampLens, shadows: "none" });
  }
  return shapes;
}

/**
 * The editor's station parts on this floor in its materials: painted panels become the floor's
 * plate, concrete or rock scan, tinted part of the way from their authored colour to its palette.
 * Lamps, glass and rubber keep their plain finishes. Placement is the editor's, untouched.
 */
export function structureShapes(stratum: Stratum, look: FloorLook = FLOOR_LOOK[stratum]): StaticShapeInstance[] {
  const replacements = stationModelReplacements(stratum);
  const shapes: StaticShapeInstance[] = [];
  for (const part of editorLayers.volumes) {
    if (part.kind !== "deepward-structure" || part.meta?.place !== stratum) continue;
    if (part.label && replacements.has(part.label)) continue;
    const kind = String(part.meta?.surface ?? "paint");
    const color = part.color ?? "#89918c";
    let surface: AuthoredSurfaceConfig;
    if (kind === "lamp") surface = { color, emissive: color, emissiveIntensity: 1.6, roughness: 0.48, metalness: 0 };
    else if (kind === "glass") surface = { color: "#193a40", roughness: 0.16, metalness: 0, transparent: true, opacity: 0.72, depthWrite: false };
    else if (kind === "rubber") surface = { color: "#202a2c", roughness: 0.94, metalness: 0 };
    else surface = librarySurface(look.structure[kind as keyof FloorLook["structure"]] ?? look.structure.paint, blendTint(color, look.structureTint, look.structureBlend));
    const rotation = [Number(part.meta?.turnX ?? 0), Number(part.meta?.turn ?? 0), Number(part.meta?.turnZ ?? 0)] as const;
    const position = [part.center.x, part.center.y, part.center.z] as const;
    if (part.shape === "box" && part.halfExtents) shapes.push({ shape: "box", position, rotation, scale: [part.halfExtents.x * 2, part.halfExtents.y * 2, part.halfExtents.z * 2], surface });
    else shapes.push({ shape: "cylinder", position, rotation, scale: [part.radius ?? 1, part.height ?? 1, part.radius ?? 1], surface, radialSegments: 16 });
  }
  return shapes;
}

/**
 * One floor's interior: its shell and station parts in the floor's scanned materials, the derived
 * trims, pipes, cables, stains and wall lamps, the practical lights that follow the camera through
 * them, and library clutter props GPU-instanced against the walls.
 */
export function InteriorArt({ stratum }: { stratum: Stratum }) {
  const look = FLOOR_LOOK[stratum];
  const dressing = floorDressing(stratum);
  const shapes = useMemo(() => [...shellShapes(stratum, look), ...structureShapes(stratum, look)], [stratum, look]);
  const props = useMemo<ScatterInstance[]>(() => [
    ...dressing.props.map(({ slot, model }) => ({
      id: slot.id, regionId: stratum, item: model, x: slot.position[0], y: slot.position[1], z: slot.position[2], rotationY: slot.rotationY, scale: 1,
    })),
    ...dressing.debris.map(({ slot, model }) => ({
      id: slot.id, regionId: stratum, item: model, x: slot.position[0], y: slot.position[1], z: slot.position[2], rotationY: slot.rotationY, scale: slot.scale,
    })),
  ], [dressing, stratum]);
  return <group>
    <StaticShapeInstances instances={shapes} />
    <InteriorDressing plan={dressing.plan} surfaces={look.dressing} cableColor={look.cable} decalSeed={stratum} />
    <PracticalLights fixtures={dressing.plan.fixtures} {...look.practical} />
    <InstancedScatter instances={props} resolveItem={resolveProp} chunkSize={48} />
  </group>;
}
