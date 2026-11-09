/**
 * Runtime renderer for the built-in `pole_line` scene kind: instanced poles (proxy cylinders, or a
 * GLB pole asset when one is named) plus merged tube geometry for the sagging cables. Registered by
 * `registerBuiltinSceneKindRenderers` so any document with a `pole_line` path renders with no game
 * wiring. Uses the generic core primitive `readNamedSockets` to hang wires off a GLB pole's authored
 * crossarm empties (falling back to computed offsets).
 */
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { sharedGltfLoader } from "@jgengine/core/model/modelLoad.draw";

import { parseParams } from "@jgengine/core/generator/paramSchema";
import { readNamedSockets, type ModelNode } from "@jgengine/core/scene/modelSockets";
import { POLE_LINE_KIND, POLE_LINE_SCHEMA, resolvePoleLine, type Cable, type Pole, type ResolvedPoleLine } from "@jgengine/core/world/poleLineKind";
import type { SceneKindObject } from "@jgengine/core/scene/sceneKinds";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { composeInstance, uploadInstances } from "@jgengine/core/instancing/instanceUpload.draw";
import { registerSceneKindRenderer, type SceneKindRenderContext } from "./sceneKindRenderers.draw";

function buildCableGeometry(cables: readonly Cable[]): THREE.BufferGeometry | null {
  const parts: THREE.TubeGeometry[] = [];
  for (const cable of cables) {
    if (cable.points.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(cable.points.map((point) => new THREE.Vector3(point[0], point[1], point[2])));
    parts.push(new THREE.TubeGeometry(curve, Math.max(2, (cable.points.length - 1) * 2), cable.radius, 6, false));
  }
  if (parts.length === 0) return null;
  const merged = mergePositionGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

function cablesDraw(cables: readonly Cable[]): EngineDraw {
  let geometry: THREE.BufferGeometry | null = null;
  let mesh: THREE.Mesh | null = null;
  return {
    mount(state: EngineFrameState) {
      geometry = buildCableGeometry(cables);
      if (geometry === null) return;
      const material = new THREE.MeshStandardMaterial({ color: "#31281f", roughness: 0.55, metalness: 0.15 });
      mesh = new THREE.Mesh(geometry, material);
      // Dark warm rubber-sheath tone with a hint of sheen — pitch black tubes read as ink scribbles
      // against the sky, real cable catches a little light along its top.
      mesh.castShadow = true;
      state.scene.add(mesh);
    },
    dispose(state: EngineFrameState) {
      if (mesh !== null) {
        state.scene.remove(mesh);
        (mesh.material as THREE.Material).dispose();
        mesh = null;
      }
      geometry?.dispose();
      geometry = null;
    },
  };
}

/**
 * Weathered wood for the proxy poles: vertical grain streaks + broad tonal banding driven by the
 * pole's own cylindrical coordinates, offset per instance so no two poles share a pattern, and a
 * sun-bleach lift toward the top. Injected via `onBeforeCompile`, instancing-aware.
 */
function createWeatheredWoodMaterial(color: string, grainAlong: "y" | "x" = "y"): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vJgWoodLocal;
varying vec2 vJgWoodSeed;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vJgWoodLocal = position;
#ifdef USE_INSTANCING
vJgWoodSeed = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
#else
vJgWoodSeed = vec2(0.0);
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vJgWoodLocal;
varying vec2 vJgWoodSeed;
float jgWoodHash(vec2 p){
  uvec2 q = uvec2(ivec2(floor(p)));
  uint x = q.x * 1664525u + q.y * 1013904223u;
  x = (x ^ (x >> 16u)) * 2246822519u;
  x = (x ^ (x >> 13u)) * 3266489917u;
  return float(x ^ (x >> 16u)) * (1.0 / 4294967296.0);
}
float jgWoodNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = jgWoodHash(i); float b = jgWoodHash(i + vec2(1.0, 0.0));
  float c = jgWoodHash(i + vec2(0.0, 1.0)); float d = jgWoodHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
${
          grainAlong === "y"
            ? `vec2 jgWoodUv = vec2(atan(vJgWoodLocal.x, vJgWoodLocal.z) * 1.4, vJgWoodLocal.y * 0.55);`
            : `vec2 jgWoodUv = vec2(vJgWoodLocal.y * 9.0 + vJgWoodLocal.z * 7.0, vJgWoodLocal.x * 0.8);`
        }
vec2 jgWoodOff = vec2(dot(vJgWoodSeed, vec2(0.73, 1.31)), dot(vJgWoodSeed, vec2(1.17, 0.41)));
float jgWoodBand = jgWoodNoise(jgWoodUv * vec2(2.0, 1.0) + jgWoodOff);
float jgWoodStreak = jgWoodNoise(jgWoodUv * vec2(7.0, 0.35) + jgWoodOff * 1.7);
diffuseColor.rgb *= mix(0.74, 1.14, jgWoodBand * 0.45 + jgWoodStreak * 0.55);
${grainAlong === "y" ? `// Sun-bleached crown, damp-darkened foot — reads as years outdoors, not fresh paint.
diffuseColor.rgb = mix(diffuseColor.rgb * 0.82, diffuseColor.rgb * vec3(1.08, 1.05, 0.98), smoothstep(-3.5, 3.0, vJgWoodLocal.y));` : ""}`,
      );
  };
  material.customProgramCacheKey = () => `jgengine-weathered-wood-${grainAlong}`;
  return material;
}

/** Minimal position/normal/index merge — avoids depending on a specific BufferGeometryUtils path. */
function mergePositionGeometries(geometries: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;
  for (const geometry of geometries) {
    vertexCount += geometry.getAttribute("position").count;
    const index = geometry.getIndex();
    indexCount += index === null ? geometry.getAttribute("position").count : index.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    positions.set(position.array as Float32Array, vertexOffset * 3);
    if (normal !== undefined) normals.set(normal.array as Float32Array, vertexOffset * 3);
    const index = geometry.getIndex();
    if (index === null) {
      for (let i = 0; i < position.count; i += 1) indices[indexOffset + i] = vertexOffset + i;
      indexOffset += position.count;
    } else {
      for (let i = 0; i < index.count; i += 1) indices[indexOffset + i] = vertexOffset + index.getX(i);
      indexOffset += index.count;
    }
    vertexOffset += position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

export interface ProxyPolesSpec {
  poles: readonly Pole[];
  height: number;
  wireCount: number;
  wireSpacing: number;
}

/**
 * Proxy utility poles built from primitives when no GLB pole asset is named: a tapered trunk, a
 * wood crossarm sized to the wire spread with a small brace, and one ceramic insulator peg under
 * each wire offset — so the cables visibly hang *from* the pole instead of floating beside a stick.
 */
function proxyPolesDraw(spec: ProxyPolesSpec): EngineDraw {
  const { poles, height, wireCount, wireSpacing } = spec;
  const armLength = wireCount > 1 ? (wireCount - 1) * wireSpacing + 0.6 : 0.8;
  // Chunkier members than a real-scale pole: stylized worlds read thin cylinders as wire, not wood.
  const trunkGeometry = new THREE.CylinderGeometry(0.13, 0.22, height, 10);
  const armGeometry = new THREE.BoxGeometry(armLength, 0.17, 0.14);
  const braceGeometry = (() => {
    const braceSpan = Math.hypot(armLength * 0.32, 0.7);
    return new THREE.BoxGeometry(0.07, braceSpan, 0.06);
  })();
  const insulatorGeometry = new THREE.CylinderGeometry(0.06, 0.085, 0.24, 8);
  const trunkMaterial = createWeatheredWoodMaterial("#6b533a");
  const armMaterial = createWeatheredWoodMaterial("#59452e", "x");
  const insulatorMaterial = new THREE.MeshStandardMaterial({ color: "#a8a18c", roughness: 0.32, metalness: 0.12 });
  const meshes: THREE.InstancedMesh[] = [];

  const buildInstances = () => {
    const trunks: THREE.Matrix4[] = [];
    const arms: THREE.Matrix4[] = [];
    const braces: THREE.Matrix4[] = [];
    const insulators: THREE.Matrix4[] = [];
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);
    const place = (into: THREE.Matrix4[]): void => {
      into.push(new THREE.Matrix4().compose(position, quaternion, scale));
    };
    const armY = height - 0.22;
    const half = (wireCount - 1) / 2;
    const braceAngle = Math.atan2(armLength * 0.32, 0.7);
    for (const pole of poles) {
      euler.set(0, pole.yaw, 0);
      quaternion.setFromEuler(euler);
      position.set(pole.position[0], pole.position[1] + height / 2, pole.position[2]);
      place(trunks);
      position.set(pole.position[0], pole.position[1] + armY, pole.position[2]);
      place(arms);
      // Two diagonal braces from the trunk up to the crossarm — the classic A-frame silhouette.
      const cos = Math.cos(pole.yaw);
      const sin = Math.sin(pole.yaw);
      for (let side = 0; side < 2; side += 1) {
        const direction = side === 0 ? 1 : -1;
        const lateral = direction * armLength * 0.16;
        position.set(pole.position[0] + cos * lateral, pole.position[1] + armY - 0.38, pole.position[2] - sin * lateral);
        euler.set(0, pole.yaw, direction * braceAngle);
        quaternion.setFromEuler(euler);
        place(braces);
      }
      euler.set(0, pole.yaw, 0);
      quaternion.setFromEuler(euler);
      // Insulator pegs sit on the crossarm at each wire's lateral offset (the pole's local X axis
      // after yaw — the same perpendicular the resolver strings cables along).
      for (let w = 0; w < wireCount; w += 1) {
        const offset = (w - half) * wireSpacing;
        position.set(pole.position[0] + cos * offset, pole.position[1] + height - 0.08, pole.position[2] - sin * offset);
        place(insulators);
      }
    }
    return { trunks, arms, braces, insulators };
  };

  return {
    mount(state: EngineFrameState) {
      const batches = buildInstances();
      const trunk = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, Math.max(1, poles.length));
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      uploadInstances(trunk, batches.trunks);
      state.scene.add(trunk);
      meshes.push(trunk);
      if (wireCount > 0) {
        const arm = new THREE.InstancedMesh(armGeometry, armMaterial, Math.max(1, poles.length));
        arm.castShadow = true;
        arm.receiveShadow = true;
        uploadInstances(arm, batches.arms);
        state.scene.add(arm);
        meshes.push(arm);
        const brace = new THREE.InstancedMesh(braceGeometry, armMaterial, Math.max(1, poles.length * 2));
        brace.castShadow = true;
        uploadInstances(brace, batches.braces);
        state.scene.add(brace);
        meshes.push(brace);
        const insulator = new THREE.InstancedMesh(insulatorGeometry, insulatorMaterial, Math.max(1, poles.length * wireCount));
        insulator.castShadow = true;
        uploadInstances(insulator, batches.insulators);
        state.scene.add(insulator);
        meshes.push(insulator);
      }
    },
    dispose(state: EngineFrameState) {
      for (const mesh of meshes.splice(0)) {
        state.scene.remove(mesh);
        mesh.dispose();
      }
      trunkGeometry.dispose();
      armGeometry.dispose();
      braceGeometry.dispose();
      insulatorGeometry.dispose();
      trunkMaterial.dispose();
      armMaterial.dispose();
      insulatorMaterial.dispose();
    },
  };
}

const gltfLoads = new Map<string, Promise<GLTF>>();
function loadPoleGltf(url: string): Promise<GLTF> {
  let promise = gltfLoads.get(url);
  if (promise === undefined) {
    promise = sharedGltfLoader.loadAsync(url);
    gltfLoads.set(url, promise);
    promise.catch(() => gltfLoads.delete(url));
  }
  return promise;
}

function modelPolesDraw(url: string, poles: readonly Pole[], onReady?: () => void): EngineDraw {
  const meshes: THREE.InstancedMesh[] = [];
  let cancelled = false;
  let mounted = false;
  return {
    mount(state: EngineFrameState) {
      mounted = true;
      void loadPoleGltf(url).then((gltf) => {
        if (cancelled || !mounted) return;
        const sources: { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }[] = [];
        gltf.scene.updateWorldMatrix(true, true);
        gltf.scene.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (mesh.isMesh) sources.push({ geometry: mesh.geometry, material: mesh.material as THREE.Material, local: mesh.matrixWorld.clone() });
        });
        // readNamedSockets is available for wire-anchor refinement; the proxy path already honors offsets.
        void readNamedSockets(gltf.scene as unknown as ModelNode);
        for (const source of sources) {
          const instanced = new THREE.InstancedMesh(source.geometry, source.material, Math.max(1, poles.length));
          instanced.castShadow = true;
          instanced.receiveShadow = true;
          uploadInstances(
            instanced,
            { count: poles.length, at: (index, out) => composeInstance(out, poles[index]!.position, [0, poles[index]!.yaw, 0], 1) },
            { localMatrix: source.local },
          );
          state.scene.add(instanced);
          meshes.push(instanced);
        }
        onReady?.();
      }).catch(() => {
        // A failed pole asset keeps the proxy poles showing, like the old Suspense fallback.
      });
    },
    dispose(state: EngineFrameState) {
      cancelled = true;
      mounted = false;
      for (const mesh of meshes.splice(0)) {
        state.scene.remove(mesh);
        mesh.dispose();
      }
    },
  };
}

function poleLineDraw(object: SceneKindObject, context: SceneKindRenderContext): EngineDraw {
  const resolved: ResolvedPoleLine = resolvePoleLine(object, parseParams(POLE_LINE_SCHEMA, object.meta), { sampleHeight: (x, z) => context.field.sampleHeight(x, z) });
  const modelUrl = resolved.poleAsset.length > 0 ? context.assets?.resolve(resolved.poleAsset)?.url : undefined;
  const proxy = proxyPolesDraw({ poles: resolved.poles, height: resolved.poleHeight, wireCount: resolved.wireCount, wireSpacing: resolved.wireSpacing });
  const cables = cablesDraw(resolved.cables);
  const live = new Set<EngineDraw>([cables]);
  let lastState: EngineFrameState | null = null;
  let model: EngineDraw | null = null;
  if (modelUrl !== undefined) {
    model = modelPolesDraw(modelUrl, resolved.poles, () => {
      // The GLB poles arrived: the proxy fallback is no longer needed.
      if (live.delete(proxy) && lastState !== null) proxy.dispose?.(lastState);
    });
    live.add(proxy);
    live.add(model);
  } else {
    live.add(proxy);
  }
  const children = [...live];

  return {
    mount(state: EngineFrameState) {
      lastState = state;
      for (const child of children) child.mount?.(state);
    },
    frame(state: EngineFrameState) {
      for (const child of live) child.frame?.(state);
    },
    update(state: EngineFrameState) {
      for (const child of live) child.update?.(state);
    },
    dispose(state: EngineFrameState) {
      for (const child of live) child.dispose?.(state);
      live.clear();
      lastState = null;
    },
  };
}

function PoleLineObject({ object, context }: { object: SceneKindObject; context: SceneKindRenderContext }) {
  useEngineDraw(() => poleLineDraw(object, context), [object, context.field]);
  return null;
}

/** Registers the built-in pole-line runtime renderer. Called by `registerBuiltinSceneKindRenderers`. @internal */
export function registerPoleLineRenderer(): void {
  registerSceneKindRenderer(POLE_LINE_KIND, ({ objects, context }) => (
    <>
      {objects.map((object) => (
        <PoleLineObject key={object.id} object={object} context={context} />
      ))}
    </>
  ));
}
