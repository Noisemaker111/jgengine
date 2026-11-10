import { useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

import { nearestFixtures, type InteriorDecal, type InteriorDecalStyle, type InteriorDressingPlan, type InteriorFixture } from "@jgengine/core/world/interiorDressing";

import type { AuthoredSurfaceConfig } from "@jgengine/core/material/authoredSurfaceMaterial.draw";
import { acquireDecalTexture, type DecalTextureLease } from "@jgengine/core/scene/useDecalTexture.draw";
import { hashUnit } from "@jgengine/core/random/rng";
import { staticShapeInstancesDraw, type StaticShapeInstance } from "@jgengine/core/instancing/staticShapeInstances.draw";
import { uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";

/** The surface each dressing family wears. Any family left out falls back to a plain painted default. */
export interface InteriorDressingSurfaces {
  /** Skirting boards, chair rails, crown mouldings and wall ribs. */
  trim: AuthoredSurfaceConfig;
  /** Wall-run and drop pipes. */
  pipe: AuthoredSurfaceConfig;
  /** Pipe brackets and valve bodies. */
  fitting: AuthoredSurfaceConfig;
  /** Lamp housings. */
  housing: AuthoredSurfaceConfig;
  /** Lamp lenses; give it an emissive colour so the lamp reads lit. */
  lens: AuthoredSurfaceConfig;
  /** The lens of a dead lamp: no glow. */
  lensOff: AuthoredSurfaceConfig;
  /** Wainscot plates: a second finish that breaks a long wall up. */
  panel: AuthoredSurfaceConfig;
  /** Access hatches. */
  hatch: AuthoredSurfaceConfig;
}

/** Plain defaults: grey paint, dull steel, a warm lens. */
export const DEFAULT_INTERIOR_SURFACES: InteriorDressingSurfaces = {
  trim: { color: "#3b3f44", roughness: 0.7, metalness: 0.1 },
  pipe: { color: "#6b7076", roughness: 0.45, metalness: 0.8 },
  fitting: { color: "#3c3a36", roughness: 0.55, metalness: 0.7 },
  housing: { color: "#26282b", roughness: 0.6, metalness: 0.6 },
  lens: { color: "#fff2d6", emissive: "#ffe2b0", emissiveIntensity: 3, roughness: 0.3, metalness: 0 },
  lensOff: { color: "#4a4844", roughness: 0.35, metalness: 0 },
  panel: { color: "#4a4f55", roughness: 0.6, metalness: 0.35 },
  hatch: { color: "#55585c", roughness: 0.5, metalness: 0.6 },
};

const UP = new THREE.Vector3(0, 1, 0);
const pipeDir = new THREE.Vector3();
const pipeTurn = new THREE.Quaternion();
const pipeEuler = new THREE.Euler();
/** Housing and lens of a wall lamp, metres. */
const HOUSING: readonly [number, number, number] = [0.62, 0.1, 0.2];
const LENS: readonly [number, number, number] = [0.54, 0.025, 0.14];

/**
 * Every box and cylinder in a dressing plan as static instances: trims, fittings, pipes (cylinders
 * turned along their run) and the housing plus lens of each lamp. Pure, so a test can count them.
 * @internal
 */
export function interiorDressingShapes(plan: InteriorDressingPlan, surfaces: Partial<InteriorDressingSurfaces> = {}): StaticShapeInstance[] {
  const use = { ...DEFAULT_INTERIOR_SURFACES, ...surfaces };
  const shapes: StaticShapeInstance[] = [];
  for (const trim of plan.trims) shapes.push({ shape: "box", position: trim.center, rotation: [0, trim.rotationY, 0], scale: trim.size, surface: use.trim, shadows: "receive" });
  for (const panel of plan.panels) shapes.push({ shape: "box", position: panel.center, rotation: [0, panel.rotationY, 0], scale: panel.size, surface: panel.role === "hatch" ? use.hatch : use.panel, shadows: "receive" });
  for (const fitting of plan.fittings) {
    shapes.push(fitting.role === "valve"
      ? { shape: "cylinder", position: fitting.center, rotation: [Math.PI / 2, fitting.rotationY, 0], scale: [fitting.size[0] / 2, fitting.size[2], fitting.size[0] / 2], surface: use.fitting, shadows: "receive", radialSegments: 10 }
      : { shape: "box", position: fitting.center, rotation: [0, fitting.rotationY, 0], scale: fitting.size, surface: use.fitting, shadows: "receive" });
  }
  for (const pipe of plan.pipes) {
    pipeDir.set(pipe.to[0] - pipe.from[0], pipe.to[1] - pipe.from[1], pipe.to[2] - pipe.from[2]);
    const length = pipeDir.length();
    if (length <= 1e-4) continue;
    pipeTurn.setFromUnitVectors(UP, pipeDir.divideScalar(length));
    pipeEuler.setFromQuaternion(pipeTurn);
    shapes.push({
      shape: "cylinder",
      position: [(pipe.from[0] + pipe.to[0]) / 2, (pipe.from[1] + pipe.to[1]) / 2, (pipe.from[2] + pipe.to[2]) / 2],
      rotation: [pipeEuler.x, pipeEuler.y, pipeEuler.z],
      scale: [pipe.radius, length, pipe.radius],
      surface: use.pipe,
      shadows: "receive",
      radialSegments: 12,
    });
  }
  for (const fixture of plan.fixtures) {
    shapes.push({ shape: "box", position: fixture.position, rotation: [0, fixture.rotationY, 0], scale: HOUSING, surface: use.housing, shadows: "none" });
    shapes.push({ shape: "box", position: [fixture.position[0], fixture.position[1] - HOUSING[1] / 2, fixture.position[2]], rotation: [0, fixture.rotationY, 0], scale: LENS, surface: fixture.state === "dead" ? use.lensOff : use.lens, shadows: "none" });
  }
  return shapes;
}

/** Every cable as one merged tube mesh, or null when there are none. @internal */
export function interiorCableGeometry(plan: InteriorDressingPlan): THREE.BufferGeometry | null {
  const tubes = plan.cables.filter((cable) => cable.points.length >= 2).map((cable) => {
    const curve = new THREE.CatmullRomCurve3(cable.points.map((point) => new THREE.Vector3(...point)));
    return new THREE.TubeGeometry(curve, Math.max(8, cable.points.length * 2), cable.radius, 5, false);
  });
  if (tubes.length === 0) return null;
  const merged = mergeGeometries(tubes, false);
  for (const tube of tubes) tube.dispose();
  return merged;
}

/** Decals grouped by style, so each style draws as one instanced mesh. @internal */
export function groupInteriorDecals(decals: readonly InteriorDecal[]): Map<InteriorDecalStyle, InteriorDecal[]> {
  const groups = new Map<InteriorDecalStyle, InteriorDecal[]>();
  for (const decal of decals) {
    const list = groups.get(decal.style);
    if (list === undefined) groups.set(decal.style, [decal]);
    else list.push(decal);
  }
  return groups;
}

const decalNormal = new THREE.Vector3();
const decalTurn = new THREE.Quaternion();
const decalSpin = new THREE.Quaternion();
const FORWARD = new THREE.Vector3(0, 0, 1);

/** Write one style's decal transforms: a unit plane turned to face `normal`, spun in its plane, sized. @internal */
export function writeInteriorDecals(mesh: THREE.InstancedMesh, decals: readonly InteriorDecal[]): void {
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  uploadInstances(
    mesh,
    {
      count: decals.length,
      at: (index, out) => {
        const decal = decals[index]!;
        decalNormal.set(...decal.normal).normalize();
        decalTurn.setFromUnitVectors(FORWARD, decalNormal);
        decalSpin.setFromAxisAngle(FORWARD, decal.spin);
        decalTurn.multiply(decalSpin);
        position.set(...decal.position);
        scale.set(decal.width, decal.height, 1);
        out.compose(position, decalTurn, scale);
      },
    },
    { colors: (index, out) => out.setScalar(decals[index]!.opacity) },
  );
}

/** One stain style as a single instanced decal mesh, its texture baked on a worker. */
function decalStyleBatchDraw({ style, decals, seed }: { style: InteriorDecalStyle; decals: readonly InteriorDecal[]; seed: string }): EngineDraw {
  let mesh: THREE.InstancedMesh | null = null;
  let geometry: THREE.PlaneGeometry | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  let lease: DecalTextureLease | null = null;
  return {
    mount(state: EngineFrameState) {
      geometry = new THREE.PlaneGeometry(1, 1);
      lease = acquireDecalTexture(style, `${seed}:${style}`, 128, {}, (map) => {
        map.colorSpace = THREE.SRGBColorSpace;
        map.magFilter = THREE.LinearFilter;
        map.minFilter = THREE.LinearMipmapLinearFilter;
        map.generateMipmaps = true;
      }, state);
      // Instance colour carries each stain's opacity; the alpha map is the coverage.
      const wet = style === "wet";
      const roughness = wet ? 0.06 : style === "hazard" ? 0.6 : style === "paper" ? 0.85 : 0.95;
      material = new THREE.MeshStandardMaterial({ map: lease.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness, metalness: wet ? 0.2 : 0 });
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n#ifdef USE_INSTANCING_COLOR\n diffuseColor.a *= vColor.r;\n diffuseColor.rgb /= max(vColor.rgb, vec3(1e-3));\n#endif");
      };
      mesh = new THREE.InstancedMesh(geometry, material, decals.length);
      mesh.receiveShadow = true;
      mesh.renderOrder = 2;
      writeInteriorDecals(mesh, decals);
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) {
        state.scene.remove(mesh);
        mesh.dispose();
        mesh = null;
      }
      geometry?.dispose();
      geometry = null;
      material?.dispose();
      material = null;
      lease?.dispose();
      lease = null;
    },
  };
}

/** Every cable as one mesh, or none when the plan has no cables. */
function interiorCablesDraw(plan: InteriorDressingPlan, cableColor: THREE.ColorRepresentation): EngineDraw {
  const geometry = interiorCableGeometry(plan);
  const material = new THREE.MeshStandardMaterial({ color: cableColor, roughness: 0.75, metalness: 0 });
  let mesh: THREE.Mesh | null = null;
  return {
    mount(state: EngineFrameState) {
      if (geometry === null) return;
      mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) {
        state.scene.remove(mesh);
        mesh = null;
      }
      geometry?.dispose();
      material.dispose();
    },
  };
}

/** Props for {@link InteriorDressing}. */
export interface InteriorDressingProps {
  plan: InteriorDressingPlan;
  surfaces?: Partial<InteriorDressingSurfaces>;
  /** Cable sheath colour; default near-black rubber. */
  cableColor?: THREE.ColorRepresentation;
  /** Seed for the baked stain textures; defaults to one shared set. */
  decalSeed?: string;
  /** Draw the stains; default true. */
  decals?: boolean;
}

/**
 * The drawn side of a planned interior as one draw: trims, pipes, fittings and lamp housings as
 * static instance batches, every cable as one merged tube, and every stain style as one instanced
 * decal mesh. A whole floor costs a handful of draws however many pieces it has. Pair it with
 * {@link practicalLightsDraw} for the lamps' light.
 * @capability interior-dressing render a planned interior's trims, pipes, cables, lamps and stains in a few instanced draws
 */
export function interiorDressingDraw(getProps: () => InteriorDressingProps): EngineDraw {
  let children: EngineDraw[] = [];
  let shapes: readonly StaticShapeInstance[] = [];
  let lastPlan: InteriorDressingPlan | null = null;
  let lastSurfaces: InteriorDressingProps["surfaces"] | null = null;
  let lastDecals = true;
  let lastDecalSeed = "interior";
  let lastCableColor: THREE.ColorRepresentation = "#141414";

  const rebuild = (state: EngineFrameState) => {
    for (const child of children) child.dispose?.(state);
    children = [];
    const props = getProps();
    shapes = interiorDressingShapes(props.plan, props.surfaces);
    if (shapes.length > 0) children.push(staticShapeInstancesDraw(() => shapes));
    if (props.plan.cables.length > 0) children.push(interiorCablesDraw(props.plan, props.cableColor ?? "#141414"));
    const seed = props.decalSeed ?? "interior";
    for (const [style, list] of groupInteriorDecals(props.decals === false ? [] : props.plan.decals)) {
      children.push(decalStyleBatchDraw({ style, decals: list, seed }));
    }
    for (const child of children) child.mount?.(state);
  };

  const sync = (state: EngineFrameState) => {
    const props = getProps();
    const surfaces = props.surfaces;
    const decals = props.decals !== false;
    const seed = props.decalSeed ?? "interior";
    const cableColor = props.cableColor ?? "#141414";
    if (props.plan === lastPlan && surfaces === lastSurfaces && decals === lastDecals && seed === lastDecalSeed && cableColor === lastCableColor && children.length > 0) return;
    // Cable geometry keys on the plan alone, like the old useDisposable; everything else rebuilt
    // together is cheap next to a plan change.
    lastPlan = props.plan;
    lastSurfaces = surfaces;
    lastDecals = decals;
    lastDecalSeed = seed;
    lastCableColor = cableColor;
    rebuild(state);
  };

  return {
    mount(state) {
      sync(state);
    },
    update(state) {
      sync(state);
      for (const child of children) child.update?.(state);
    },
    frame(state) {
      for (const child of children) child.frame?.(state, state.delta);
    },
    dispose(state) {
      for (const child of children) child.dispose?.(state);
      children = [];
      lastPlan = null;
    },
  };
}

/**
 * The drawn side of a planned interior: trims, pipes, fittings and lamp housings as static instance
 * batches, every cable as one merged tube, and every stain style as one instanced decal mesh. A
 * whole floor costs a handful of draws however many pieces it has. Pair it with
 * {@link PracticalLights} for the lamps' light.
 * @capability interior-dressing render a planned interior's trims, pipes, cables, lamps and stains in a few instanced draws
 */
export function InteriorDressing(props: InteriorDressingProps) {
  const latest = useRef(props);
  latest.current = props;
  return <EngineDrawMount create={() => interiorDressingDraw(() => latest.current)} deps={[]} />;
}

/**
 * How bright a flickering lamp is at time `t` seconds, 0..1: mostly on, with seeded stutters and the
 * odd drop-out, never a smooth sine. Pure so a test can pin it. @internal
 */
export function practicalFlicker(t: number, phase: number): number {
  const slot = Math.floor(t * 9 + phase * 31);
  const roll = Math.abs(Math.sin(slot * 12.9898 + phase * 78.233) * 43758.5453) % 1;
  if (roll < 0.12) return 0.05;
  if (roll < 0.3) return 0.45 + roll;
  return 0.92 + 0.08 * Math.sin(t * 47 + phase * 6.28);
}

/** Props for {@link PracticalLights}. */
export interface PracticalLightsProps {
  fixtures: readonly InteriorFixture[];
  /** Lights in the pool; fixed for the component's life so shaders never recompile. Default 6. */
  count?: number;
  /** How many of the nearest lights cast shadows; fixed like `count`. Default 0. */
  shadowed?: number;
  /**
   * How many of the pool may burn at once; the rest stay dark. Default `count`. One pool sized for
   * the largest budget and mounted in every place keeps the scene's light count constant, so moving
   * between places with different budgets (or none) never recompiles every lit material.
   */
  lit?: number;
  color?: THREE.ColorRepresentation;
  intensity?: number;
  /** Light range, metres. Default 9. */
  distance?: number;
  /** Cone half-angle, radians. Default 1.05. */
  angle?: number;
  penumbra?: number;
  /** Lamps further than this from the camera stay dark. Default 28 m. */
  reach?: number;
  /** Frames between re-picking the nearest lamps. Default 8. */
  every?: number;
}

/**
 * A fixed pool of spot lights that follows the camera through a planned interior, lighting the
 * lamps nearest the eye and aiming each down and out from its wall. The pool size and shadow count
 * never change, so walking a floor of hundreds of lamps costs the same few lights.
 * @capability practical-lights light the planned lamps nearest the camera with a fixed, shadow-capped spot-light pool
 */
export function practicalLightsDraw(getProps: () => PracticalLightsProps): EngineDraw {
  const group = new THREE.Group();
  let lights: THREE.SpotLight[] = [];
  let flickers: (number | null)[] = [];
  let burning: InteriorFixture[] = [];
  let lastFixtures: readonly InteriorFixture[] | null = null;
  let lastCount = -1;
  let lastShadowed = -1;
  let lastColor = "";
  let lastDistance = 0;
  let lastAngle = 0;
  let lastPenumbra = 0;
  let frame = 0;
  // The pool picks on its first frame, then every `every` frames — the old ref seeded at `every`.
  let firstPick = true;

  const buildPool = () => {
    const props = getProps();
    const count = Math.max(0, props.count ?? 6);
    const shadowed = props.shadowed ?? 0;
    const color = props.color ?? "#ffe2b0";
    const distance = props.distance ?? 9;
    const angle = props.angle ?? 1.05;
    const penumbra = props.penumbra ?? 0.6;
    for (const light of lights) {
      group.remove(light);
      group.remove(light.target);
      light.dispose();
    }
    lights = Array.from({ length: count }, (_, index) => {
      const light = new THREE.SpotLight(color, 0, distance, angle, penumbra, 2);
      light.castShadow = index < shadowed;
      if (light.castShadow) {
        light.shadow.mapSize.set(512, 512);
        light.shadow.bias = -0.0004;
        light.shadow.normalBias = 0.02;
        light.shadow.camera.near = 0.1;
      }
      group.add(light);
      group.add(light.target);
      return light;
    });
    flickers = lights.map(() => null);
    lastCount = count;
    lastShadowed = shadowed;
    lastColor = String(color);
    lastDistance = distance;
    lastAngle = angle;
    lastPenumbra = penumbra;
  };

  const syncProps = () => {
    const props = getProps();
    const fixtures = props.fixtures;
    if (fixtures !== lastFixtures) {
      lastFixtures = fixtures;
      // A dead lamp never takes a light from the pool; a fixture planned without a state burns.
      burning = fixtures.filter((fixture) => fixture.state !== "dead");
    }
    const count = Math.max(0, props.count ?? 6);
    const shadowed = props.shadowed ?? 0;
    if (count !== lastCount || shadowed !== lastShadowed) {
      buildPool();
      return;
    }
    const color = String(props.color ?? "#ffe2b0");
    const distance = props.distance ?? 9;
    const angle = props.angle ?? 1.05;
    const penumbra = props.penumbra ?? 0.6;
    if (color !== lastColor || distance !== lastDistance || angle !== lastAngle || penumbra !== lastPenumbra) {
      lastColor = color;
      lastDistance = distance;
      lastAngle = angle;
      lastPenumbra = penumbra;
      for (const light of lights) {
        light.color.set(color);
        light.distance = distance;
        light.angle = angle;
        light.penumbra = penumbra;
      }
    }
  };

  return {
    mount(state: EngineFrameState) {
      buildPool();
      syncProps();
      state.scene.add(group);
    },
    update() {
      syncProps();
    },
    frame(state: EngineFrameState) {
      const props = getProps();
      const every = props.every ?? 8;
      const lit = props.lit ?? lights.length;
      const intensity = props.intensity ?? 14;
      const reach = props.reach ?? 28;
      frame += 1;
      const t = state.clock.elapsedTime;
      if (!firstPick && frame < every) {
        flickers.forEach((phase, index) => {
          const light = lights[index];
          if (phase !== null && light !== undefined) light.intensity = intensity * practicalFlicker(t, phase);
        });
        return;
      }
      firstPick = false;
      frame = 0;
      const eye = state.camera.position;
      const picked = nearestFixtures(burning, [eye.x, eye.y, eye.z], Math.min(lights.length, Math.max(0, lit)), reach);
      lights.forEach((light, index) => {
        const fixture = picked[index];
        // A dark light keeps its shadow slot (the count is what shaders compile for) but draws no shadow map.
        if (light.castShadow) light.shadow.autoUpdate = fixture !== undefined;
        if (fixture === undefined) {
          light.intensity = 0;
          flickers[index] = null;
          return;
        }
        const phase = fixture.state === "flicker" ? hashUnit(fixture.id) : null;
        flickers[index] = phase;
        light.intensity = phase === null ? intensity : intensity * practicalFlicker(t, phase);
        light.position.set(...fixture.light);
        light.target.position.set(fixture.light[0] + fixture.normal[0] * 1.6, fixture.light[1] - 2.4, fixture.light[2] + fixture.normal[2] * 1.6);
        light.target.updateMatrixWorld();
      });
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const light of lights) light.dispose();
      lights = [];
    },
  };
}

/**
 * A fixed pool of spot lights that follows the camera through a planned interior, lighting the
 * lamps nearest the eye and aiming each down and out from its wall. The pool size and shadow count
 * never change, so walking a floor of hundreds of lamps costs the same few lights.
 * @capability practical-lights light the planned lamps nearest the camera with a fixed, shadow-capped spot-light pool
 */
export function PracticalLights(props: PracticalLightsProps) {
  const latest = useRef(props);
  latest.current = props;
  return <EngineDrawMount create={() => practicalLightsDraw(() => latest.current)} deps={[]} />;
}
