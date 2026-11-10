import type { ReactElement } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import type { ParticleBuffers, ParticleSystem } from "@jgengine/core/vfx/particles";
import type { ParticleRenderHint } from "@jgengine/core/vfx/particleDirector";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";

/** How particle fragments composite on screen. */
export type ParticleBlending = "additive" | "normal";

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.0001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float r = length(gl_PointCoord - vec2(0.5));
    if (r > 0.5) discard;
    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.0, r));
  }
`;

const QUAD_VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec3 aEnd;
  attribute vec3 aVelocity;
  attribute float aId;
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uShape;
  uniform float uStretch;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 center = modelViewMatrix * vec4(aCenter, 1.0);
    vec4 view = center;
    if (uShape == 1.0 || uShape == 5.0) {
      vec3 end = uShape == 5.0 ? aEnd : aCenter - aVelocity * uStretch;
      vec4 tail = modelViewMatrix * vec4(end, 1.0);
      vec2 delta = center.xy - tail.xy;
      float len = length(delta);
      vec2 side = len > 0.00001 ? vec2(-delta.y, delta.x) / len : vec2(1.0, 0.0);
      view = mix(tail, center, uv.y);
      view.xy += side * position.x * aSize;
    } else if (uShape == 6.0) {
      view = modelViewMatrix * vec4(aCenter + vec3(position.x, 0.002, position.y) * aSize * 2.0, 1.0);
    } else {
      vec2 corner = position.xy * aSize;
      if (uShape == 2.0) {
        float angle = aId * 2.399963;
        corner = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * corner;
      }
      if (uShape == 3.0) {
        corner.y *= 2.7;
        corner.x += sin(aId * 1.7 + uv.y * 7.0) * aSize * 0.14 * uv.y;
      }
      if (uShape == 4.0) corner *= 1.65;
      view.xy += corner;
    }
    gl_Position = projectionMatrix * view;
  }
`;

const QUAD_FRAGMENT = /* glsl */ `
  uniform float uShape;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 d = vUv - 0.5;
    float alpha;
    if (uShape == 1.0 || uShape == 5.0) {
      alpha = smoothstep(0.5, 0.0, abs(d.x)) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
    } else if (uShape == 2.0) {
      float angle = atan(d.y, d.x);
      float edge = 0.26 + 0.12 * pow(abs(cos(angle * 3.0)), 4.0);
      alpha = smoothstep(edge, edge * 0.62, length(d));
    } else if (uShape == 3.0) {
      float width = (1.0 - vUv.y) * 0.42 + 0.04;
      alpha = smoothstep(width, 0.0, abs(d.x)) * smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
    } else if (uShape == 6.0) {
      float r = length(d);
      alpha = smoothstep(0.07, 0.0, abs(r - 0.38));
    } else {
      float r = length(d);
      alpha = smoothstep(0.5, 0.08, r);
      if (uShape == 4.0) alpha *= 0.65 + 0.35 * sin(vUv.x * 15.0 + sin(vUv.y * 12.0));
    }
    alpha *= vAlpha;
    if (alpha < 0.001) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

/** Floats per particle in a quad field's interleaved buffer: centre, end, velocity, colour, id, size, alpha. */
const QUAD_STRIDE = 15;
/** Floats per particle in a point field's interleaved buffer: position, colour, size, alpha. */
const POINT_STRIDE = 8;

const SHAPES: Record<ParticleRenderHint["shape"], number> ={ point: 0, streak: 1, flake: 2, flame: 3, smoke: 4, ribbon: 5, ripple: 6 };

/** @internal Mutable resource/upload counters read through the shell's supported diagnostics probe. */
export interface ParticleFieldMetrics {
  fieldsMounted: number;
  fieldsUnmounted: number;
  liveFields: number;
  attributeBytes: number;
  totalUploadMs: number;
  maxUploadMs: number;
  uploadSamples: number;
}

/** Props for the existing pooled particle renderer. @deprecated use {@link ParticleFieldDrawOptions} plus `system`. */
export type ParticleFieldProps = ParticleFieldDrawOptions & { system: ParticleSystem };

/** Materials of fields that left, by what they were made with, for the next field made the same way. */
const spareFieldMaterials = new Map<string, THREE.ShaderMaterial[]>();
const fieldMaterialKinds = new WeakMap<THREE.ShaderMaterial, string>();

/**
 * A field's material, reused from a field that left when one was made the same way. Disposing it
 * dropped its shader program, so the next spark or puff of the same kind linked it again in the
 * frame it appeared: an effect that comes and goes paid a link every time. @internal
 */
export function takeFieldMaterial(quad: boolean, depthWrite: boolean, blending: ParticleBlending): THREE.ShaderMaterial {
  const kind = `${quad ? "quad" : "point"}|${depthWrite ? "depth" : ""}|${blending}`;
  const spare = spareFieldMaterials.get(kind)?.pop();
  if (spare !== undefined) return spare;
  const made = new THREE.ShaderMaterial({ vertexShader: quad ? QUAD_VERTEX : VERTEX_SHADER, fragmentShader: quad ? QUAD_FRAGMENT : FRAGMENT_SHADER,
    uniforms: { uScale: { value: 300 }, uShape: { value: SHAPES.point }, uStretch: { value: 0.08 } },
    transparent: true, depthWrite, side: THREE.DoubleSide,
    blending: blending === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending });
  fieldMaterialKinds.set(made, kind);
  return made;
}

/** Hand a field's material back for the next field of its kind, keeping its program linked. @internal */
export function returnFieldMaterial(material: THREE.ShaderMaterial): void {
  const kind = fieldMaterialKinds.get(material);
  if (kind === undefined) {
    material.dispose();
    return;
  }
  const spare = spareFieldMaterials.get(kind);
  if (spare === undefined) spareFieldMaterials.set(kind, [material]);
  else if (!spare.includes(material)) spare.push(material);
}

/**
 * One empty field of each program a field can draw with: points, and instanced quads for every
 * other shape. Blending and depth writes do not change the program. For the scene's warmup to link
 * before play, since a burst's field mounts on the frame the burst fires. `dispose` hands the
 * materials to the next fields of their kind. @internal
 */
export function fieldPrograms(): { objects: THREE.Object3D[]; dispose(): void } {
  const kinds = [false, true].map((quad) => ({ material: takeFieldMaterial(quad, false, "additive"), geometry: createFieldGeometry(1, quad, false).geometry, quad }));
  return {
    objects: kinds.map(({ material, geometry, quad }) => (quad ? new THREE.Mesh(geometry, material) : new THREE.Points(geometry, material))),
    dispose() {
      for (const { material, geometry } of kinds) {
        geometry.dispose();
        returnFieldMaterial(material);
      }
    },
  };
}

/** A field's geometry and the one interleaved buffer every per-particle value lives in. @internal */
export interface FieldGeometry {
  geometry: THREE.BufferGeometry;
  packed: THREE.InterleavedBuffer;
  quad: boolean;
  ribbon: boolean;
  /** Ribbon only: each live particle id's index this frame, so a segment finds the one before it. */
  indexById: Map<number, number>;
}

/**
 * Geometry for `max` particles drawn as points or instanced quads. Every value a particle draws with
 * sits in one interleaved buffer, so a live field is one upload a frame: seven separate attributes
 * were seven, and a battle's thirty live fields sent two hundred a frame. @internal
 */
export function createFieldGeometry(max: number, quad: boolean, ribbon: boolean): FieldGeometry {
  const geometry = quad ? new THREE.InstancedBufferGeometry() : new THREE.BufferGeometry();
  const stride = quad ? QUAD_STRIDE : POINT_STRIDE;
  const packed = quad ? new THREE.InstancedInterleavedBuffer(new Float32Array(max * stride), stride) : new THREE.InterleavedBuffer(new Float32Array(max * stride), stride);
  packed.setUsage(THREE.DynamicDrawUsage);
  const at = (offset: number, size: number) => new THREE.InterleavedBufferAttribute(packed, size, offset);
  if (geometry instanceof THREE.InstancedBufferGeometry) {
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.setAttribute("aCenter", at(0, 3));
    geometry.setAttribute("aEnd", at(3, 3));
    geometry.setAttribute("aVelocity", at(6, 3));
    geometry.setAttribute("aColor", at(9, 3));
    geometry.setAttribute("aId", at(12, 1));
    geometry.setAttribute("aSize", at(13, 1));
    geometry.setAttribute("aAlpha", at(14, 1));
    geometry.instanceCount = 0;
  } else {
    geometry.setAttribute("position", at(0, 3));
    geometry.setAttribute("aColor", at(3, 3));
    geometry.setAttribute("aSize", at(6, 1));
    geometry.setAttribute("aAlpha", at(7, 1));
    geometry.setDrawRange(0, 0);
  }
  return { geometry, packed, quad, ribbon, indexById: new Map() };
}

/** Write a frame's live particles into the field's buffer, mark that range for upload, and draw that many. @internal */
export function packFieldFrame(field: FieldGeometry, buffers: ParticleBuffers): void {
  const { geometry, packed, indexById } = field;
  const count = buffers.count;
  const data = packed.array;
  const { positions, colors, sizes, alphas, velocities, ids, previousPositions } = buffers;
  if (field.quad) {
    if (field.ribbon) {
      for (let i = 0; i < count; i++) indexById.set(ids[i]!, i);
      for (const [id, index] of indexById) if (index >= count || ids[index] !== id) indexById.delete(id);
    }
    for (let i = 0; i < count; i++) {
      const o = i * QUAD_STRIDE;
      const v = i * 3;
      // A ribbon segment ends at the particle spawned just before it; anything else at its own last position.
      const previousIndex = field.ribbon ? indexById.get(ids[i]! - 1) : undefined;
      const source = previousIndex === undefined ? previousPositions : positions;
      const e = (previousIndex ?? i) * 3;
      data[o] = positions[v]!; data[o + 1] = positions[v + 1]!; data[o + 2] = positions[v + 2]!;
      data[o + 3] = source[e]!; data[o + 4] = source[e + 1]!; data[o + 5] = source[e + 2]!;
      data[o + 6] = velocities[v]!; data[o + 7] = velocities[v + 1]!; data[o + 8] = velocities[v + 2]!;
      data[o + 9] = colors[v]!; data[o + 10] = colors[v + 1]!; data[o + 11] = colors[v + 2]!;
      data[o + 12] = ids[i]!;
      data[o + 13] = sizes[i]!;
      data[o + 14] = alphas[i]!;
    }
  } else {
    for (let i = 0; i < count; i++) {
      const o = i * POINT_STRIDE;
      const v = i * 3;
      data[o] = positions[v]!; data[o + 1] = positions[v + 1]!; data[o + 2] = positions[v + 2]!;
      data[o + 3] = colors[v]!; data[o + 4] = colors[v + 1]!; data[o + 5] = colors[v + 2]!;
      data[o + 6] = sizes[i]!;
      data[o + 7] = alphas[i]!;
    }
  }
  if (geometry instanceof THREE.InstancedBufferGeometry) geometry.instanceCount = count;
  else geometry.setDrawRange(0, count);
  // An empty update range would make three send the whole pool, so an emptied field sends nothing.
  if (count === 0) return;
  packed.clearUpdateRanges();
  packed.addUpdateRange(0, count * packed.stride);
  packed.needsUpdate = true;
}

export interface ParticleFieldDrawOptions {
  /** Disable when an external loop already advances this system. Default true; a function is read per frame. */
  advance?: boolean | (() => boolean);
  blending?: ParticleBlending;
  /** Pixel multiplier for point output. Quad outputs use particle sizes in world units. */
  scale?: number;
  depthWrite?: boolean;
  /** Point, instanced sprite, velocity streak, connected ribbon, or ground ripple output. */
  render?: ParticleRenderHint | undefined;
  /** @internal Optional diagnostics; omitted in production. */
  metrics?: ParticleFieldMetrics | undefined;
}

/**
 * One pooled simulation drawn as a point cloud or instanced quads, as an {@link EngineDraw}.
 * Output selection does not replace spawn, forces, collisions, or deterministic state.
 * @capability particle-field render a core particle pool as soft points, velocity streaks, connected ribbons, flakes, flames, smoke sprites, or ground ripples
 */
export function particleFieldDraw(system: ParticleSystem, options: ParticleFieldDrawOptions = {}): EngineDraw {
  const { advance = true, blending = "additive", scale = 300, depthWrite = false, render, metrics } = options;
  const shape = render?.shape ?? "point";
  const quad = shape !== "point";
  const field = createFieldGeometry(system.buffers().positions.length / 3, quad, shape === "ribbon");
  const { geometry } = field;
  const material = takeFieldMaterial(quad, depthWrite, blending);
  material.uniforms["uScale"]!.value = scale;
  material.uniforms["uShape"]!.value = SHAPES[shape];
  material.uniforms["uStretch"]!.value = render?.stretch ?? 0.08;
  const object = quad ? new THREE.Mesh(geometry, material) : new THREE.Points(geometry, material);
  object.frustumCulled = false;
  const arrays = new Set<ArrayBufferLike>(Object.values(geometry.attributes).map((attribute) => attribute.array.buffer));
  let bytes = geometry.index?.array.byteLength ?? 0;
  for (const array of arrays) bytes += array.byteLength;
  let uploadedCount = -1;

  return {
    mount(state: EngineFrameState) {
      state.scene.add(object);
      if (metrics !== undefined) { metrics.fieldsMounted++; metrics.liveFields++; metrics.attributeBytes += bytes; }
    },
    frame(state: EngineFrameState) {
      const started = metrics === undefined ? 0 : performance.now();
      const advancing = typeof advance === "function" ? advance() : advance;
      if (advancing) system.update(Math.min(state.delta, 0.1));
      const buffers = system.buffers();
      const count = buffers.count;
      // An idle emitter has nothing to send; a live one sends its live particles, not the whole pool.
      if (count === 0 && uploadedCount === 0) return;
      uploadedCount = count;
      packFieldFrame(field, buffers);
      if (count === 0) return;
      material.uniforms["uScale"]!.value = scale * state.renderer.getPixelRatio();
      material.uniforms["uStretch"]!.value = render?.stretch ?? 0.08;
      if (metrics !== undefined) {
        const elapsed = performance.now() - started;
        metrics.totalUploadMs += elapsed;
        metrics.maxUploadMs = Math.max(metrics.maxUploadMs, elapsed);
        metrics.uploadSamples++;
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(object);
      geometry.dispose();
      returnFieldMaterial(material);
      if (metrics !== undefined) { metrics.fieldsUnmounted++; metrics.liveFields--; metrics.attributeBytes -= bytes; }
    },
  };
}

/** React mount for {@link particleFieldDraw}; props changes that affect the program remount it. */
export function ParticleField(props: ParticleFieldDrawOptions & { system: ParticleSystem }): ReactElement {
  const { system, advance = true, blending = "additive", scale = 300, depthWrite = false, render, metrics } = props;
  const shape = render?.shape ?? "point";
  useEngineDraw(
    () => particleFieldDraw(system, { advance, blending, scale, depthWrite, render, metrics }),
    [system, shape, scale, depthWrite, blending, metrics],
  );
  return <></>;
}
