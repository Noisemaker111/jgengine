import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { nearestFixtures, type InteriorDecal, type InteriorDecalStyle, type InteriorDressingPlan, type InteriorFixture } from "@jgengine/core/world/interiorDressing";

import type { AuthoredSurfaceConfig } from "./authoredSurfaceMaterial";
import { createDecalTexture } from "./decalTexture";
import { StaticShapeInstances, type StaticShapeInstance } from "./staticShapeInstances";
import { submitInstanceCount } from "./submittedDraws";
import { useDisposable } from "./useDisposable";

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
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  decals.forEach((decal, index) => {
    decalNormal.set(...decal.normal).normalize();
    decalTurn.setFromUnitVectors(FORWARD, decalNormal);
    decalSpin.setFromAxisAngle(FORWARD, decal.spin);
    decalTurn.multiply(decalSpin);
    position.set(...decal.position);
    scale.set(decal.width, decal.height, 1);
    mesh.setMatrixAt(index, matrix.compose(position, decalTurn, scale));
    mesh.setColorAt(index, new THREE.Color(decal.opacity, decal.opacity, decal.opacity));
  });
  submitInstanceCount(mesh, decals.length);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function DecalStyleBatch({ style, decals, seed }: { style: InteriorDecalStyle; decals: readonly InteriorDecal[]; seed: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geometry = useDisposable(() => new THREE.PlaneGeometry(1, 1), []);
  const texture = useDisposable(() => {
    const { size, data } = createDecalTexture(style, `${seed}:${style}`);
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    map.colorSpace = THREE.SRGBColorSpace;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    return map;
  }, [style, seed]);
  const material = useDisposable(() => {
    // Instance colour carries each stain's opacity; the alpha map is the coverage.
    const wet = style === "wet";
    const roughness = wet ? 0.06 : style === "hazard" ? 0.6 : style === "paper" ? 0.85 : 0.95;
    const surface = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness, metalness: wet ? 0.2 : 0 });
    surface.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\n#ifdef USE_INSTANCING_COLOR\n diffuseColor.a *= vColor.r;\n diffuseColor.rgb /= max(vColor.rgb, vec3(1e-3));\n#endif");
    };
    return surface;
  }, [texture, style]);
  useLayoutEffect(() => {
    if (ref.current !== null) writeInteriorDecals(ref.current, decals);
  }, [decals]);
  return <instancedMesh ref={ref} args={[geometry, material, decals.length]} receiveShadow renderOrder={2} />;
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
 * The drawn side of a planned interior: trims, pipes, fittings and lamp housings as static instance
 * batches, every cable as one merged tube, and every stain style as one instanced decal mesh. A
 * whole floor costs a handful of draws however many pieces it has. Pair it with
 * {@link PracticalLights} for the lamps' light.
 * @capability interior-dressing render a planned interior's trims, pipes, cables, lamps and stains in a few instanced draws
 */
export function InteriorDressing({ plan, surfaces, cableColor = "#141414", decalSeed = "interior", decals = true }: InteriorDressingProps) {
  const shapes = useMemo(() => interiorDressingShapes(plan, surfaces), [plan, surfaces]);
  const cables = useDisposable(() => interiorCableGeometry(plan) ?? new THREE.BufferGeometry(), [plan]);
  const groups = useMemo(() => [...groupInteriorDecals(decals ? plan.decals : [])], [plan, decals]);
  return <group>
    {shapes.length > 0 && <StaticShapeInstances instances={shapes} />}
    {plan.cables.length > 0 && <mesh geometry={cables} receiveShadow><meshStandardMaterial color={cableColor} roughness={0.75} metalness={0} /></mesh>}
    {groups.map(([style, list]) => <DecalStyleBatch key={style} style={style} decals={list} seed={decalSeed} />)}
  </group>;
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

function phaseOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Props for {@link PracticalLights}. */
export interface PracticalLightsProps {
  fixtures: readonly InteriorFixture[];
  /** Lights in the pool; fixed for the component's life so shaders never recompile. Default 6. */
  count?: number;
  /** How many of the nearest lights cast shadows; fixed like `count`. Default 0. */
  shadowed?: number;
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
export function PracticalLights({ fixtures, count = 6, shadowed = 0, color = "#ffe2b0", intensity = 14, distance = 9, angle = 1.05, penumbra = 0.6, reach = 28, every = 8 }: PracticalLightsProps) {
  // A dead lamp never takes a light from the pool; a fixture planned without a state burns.
  const burning = useMemo(() => fixtures.filter((fixture) => fixture.state !== "dead"), [fixtures]);
  const flickers = useRef<(number | null)[]>([]);
  const lights = useMemo(() => Array.from({ length: Math.max(0, count) }, (_, index) => {
    const light = new THREE.SpotLight(color, 0, distance, angle, penumbra, 2);
    light.castShadow = index < shadowed;
    if (light.castShadow) {
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.02;
      light.shadow.camera.near = 0.1;
    }
    return light;
    // Pool shape is fixed for the component's life; colour and the rest update below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [count, shadowed]);
  useEffect(() => {
    for (const light of lights) {
      light.color.set(color);
      light.distance = distance;
      light.angle = angle;
      light.penumbra = penumbra;
    }
  }, [lights, color, distance, angle, penumbra]);
  useEffect(() => () => {
    for (const light of lights) light.dispose();
  }, [lights]);
  const frame = useRef(every);
  useFrame(({ camera, clock }) => {
    frame.current += 1;
    if (frame.current < every) {
      const t = clock.elapsedTime;
      flickers.current.forEach((phase, index) => {
        if (phase !== null && lights[index] !== undefined) lights[index]!.intensity = intensity * practicalFlicker(t, phase);
      });
      return;
    }
    frame.current = 0;
    const eye = camera.position;
    const picked = nearestFixtures(burning, [eye.x, eye.y, eye.z], lights.length, reach);
    lights.forEach((light, index) => {
      const fixture = picked[index];
      if (fixture === undefined) {
        light.intensity = 0;
        flickers.current[index] = null;
        return;
      }
      const phase = fixture.state === "flicker" ? phaseOf(fixture.id) : null;
      flickers.current[index] = phase;
      light.intensity = phase === null ? intensity : intensity * practicalFlicker(clock.elapsedTime, phase);
      light.position.set(...fixture.light);
      light.target.position.set(fixture.light[0] + fixture.normal[0] * 1.6, fixture.light[1] - 2.4, fixture.light[2] + fixture.normal[2] * 1.6);
      light.target.updateMatrixWorld();
    });
  });
  return <group>
    {lights.map((light, index) => <group key={index}><primitive object={light} /><primitive object={light.target} /></group>)}
  </group>;
}
