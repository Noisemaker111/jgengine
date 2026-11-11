/** @jsxImportSource @jgengine/core/ui/jsx */
import { useRef } from "@jgengine/core/ui/jsx";
import * as THREE from "three";

import { devtools } from "@jgengine/core/devtools/devtools";
import { IMPACT_PROFILES, impactClassFor, type ImpactClass, type ImpactProfile } from "@jgengine/core/combat/impactProfile";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import { useAccessibilitySettings } from "@jgengine/core/settings/accessibilitySettings.view";
import { useGameContext } from "@jgengine/react/provider";

import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { cameraShake } from "@jgengine/core/camera/shake/cameraShake";
import { useTerrainQuality } from "@jgengine/core/terrain/terrainQuality.draw";
import { visitVisible } from "@jgengine/core/visibility/visitVisible.draw";

/** What {@link ImpactFeedback} reacts with; every field defaults on. */
export interface ImpactFeedbackOptions {
  /** Damage type / effect id → class, for names the built-in weapon words do not cover. */
  classes?: Readonly<Record<string, ImpactClass>> | undefined;
  /** Marks where direct-fire shots miss into a surface. */
  marks?: boolean | undefined;
  /** Short time stop on the local player's heavy hits, hits taken and kills. */
  hitstop?: boolean | undefined;
  /** Killed rigged characters fall as ragdolls before they fade. */
  ragdolls?: boolean | undefined;
}

const MARK_LIFE_S = 25;
const MARK_FADE_S = 2;
const MARK_LIMIT: Record<GraphicsQuality, number> = { low: 0, medium: 32, high: 64, ultra: 96 };
const HITSTOP_SCALE = 0.05;
/** One kick per blast: an explosion that damages five things still kicks the camera once. */
const KICK_GAP_MS = 120;

/**
 * Camera trauma for an impact `distance` metres from the local player: the profile's full kick at
 * the player, falling off with the square of the distance to nothing at `kickRadius`. Exported for tests.
 * @internal
 */
export function impactKick(profile: Pick<ImpactProfile, "kick" | "kickRadius">, distance: number): number {
  if (profile.kick <= 0 || profile.kickRadius <= 0 || distance >= profile.kickRadius) return 0;
  const t = 1 - Math.max(0, distance) / profile.kickRadius;
  return profile.kick * t * t;
}

/** What the layer has done since it mounted, for `debug_snapshot` under `render/impacts`. */
const stats = { bursts: 0, marks: 0, missedSurface: 0, kicks: 0, hitstops: 0, surfaceMsMax: 0, surfaceMsLast: 0 };

interface Mark {
  born: number;
  size: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/**
 * Tracks a short hit-stop on the game clock: the clock slows to 5% for the given real milliseconds
 * and returns to whatever the game had set. A game that changes the timescale itself during the
 * stop keeps its own value. Exported for tests.
 * @internal
 */
export function createHitstop(time: Pick<GameContext["time"], "timescale" | "setTimescale">) {
  let until = 0;
  let restore = 1;
  let applied = -1;
  return {
    start(ms: number, now: number): void {
      if (ms <= 0) return;
      if (applied < 0) {
        restore = time.timescale();
        applied = restore * HITSTOP_SCALE;
        time.setTimescale(applied);
      }
      until = Math.max(until, now + ms);
    },
    tick(now: number): void {
      if (applied < 0 || now < until) return;
      if (time.timescale() === applied) time.setTimescale(restore);
      applied = -1;
    },
    active(): boolean {
      return applied >= 0;
    },
  };
}

function markTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const angle = Math.atan2(dy, dx);
      const rays = 0.82 + 0.18 * Math.sin(angle * 7 + Math.sin(angle * 3) * 2);
      // A dark hole inside a pale chipped ring, so the mark reads on dark asphalt and pale stone alike.
      const core = Math.max(0, 1 - r / 0.3);
      const ring = Math.max(0, 1 - Math.abs(r - 0.5 * rays) / 0.22);
      const edge = Math.max(0, 1 - r / rays) ** 1.4;
      const i = (y * size + x) * 4;
      const shade = core > 0 ? 14 : 14 + 190 * ring;
      data[i] = shade;
      data[i + 1] = shade * 0.96;
      data[i + 2] = shade * 0.9;
      data[i + 3] = Math.round(255 * Math.min(1, core + ring * 0.85 * edge + edge * 0.35));
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const Z = new THREE.Vector3(0, 0, 1);
const surfaceRay = new THREE.Raycaster();
const boundsScratch = new THREE.Sphere();
const alongScratch = new THREE.Vector3();
const instanceScratch = new THREE.Matrix4();
/** How far back from the physics hit the drawn-surface ray starts: deeper than any road or floor slab. */
const SURFACE_LOOKBACK_M = 1.2;
const SURFACE_MAX_TRIANGLES = 6000;
/** Rapid fire refines one shot in this window; the rest keep the physics hit. */
const SURFACE_GAP_MS = 120;

/**
 * The first drawn surface along a shot, from the rendered scene rather than the physics world: roads,
 * floors and props are often meshes with no collider over a lower ground, and a mark placed on the
 * physics hit would sit hidden under them. Skinned characters, sprites, lines and overlay effects
 * are skipped. Exported for tests.
 * @internal
 */
export function drawnSurfaceHit(
  scene: THREE.Object3D,
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  far: number,
  skip: THREE.Object3D | null,
  camera: THREE.Camera | null = null,
): { point: [number, number, number]; normal: [number, number, number]; distance: number } | null {
  surfaceRay.set(new THREE.Vector3(origin[0], origin[1], origin[2]), new THREE.Vector3(direction[0], direction[1], direction[2]));
  surfaceRay.near = 0.05;
  surfaceRay.far = far;
  // Screen-space lines (LineSegments2) refuse to raycast without a camera.
  if (camera !== null) surfaceRay.camera = camera;
  // Prune by bounds before any triangle test: only meshes whose bounds touch this short ray are cast.
  const ray = surfaceRay.ray;
  const hits: THREE.Intersection[] = [];
  visitVisible(scene, (node) => {
    const object = node as THREE.Mesh & { isSkinnedMesh?: boolean; isInstancedMesh?: boolean; boundingSphere?: THREE.Sphere | null };
    if (object.isMesh !== true || object === skip || object.isSkinnedMesh === true) return;
    let sphere: THREE.Sphere | null;
    if (object.isInstancedMesh === true) {
      const instanced = object as unknown as THREE.InstancedMesh;
      if (instanced.boundingSphere === null) instanced.computeBoundingSphere();
      sphere = instanced.boundingSphere;
    } else {
      if (object.geometry.boundingSphere === null) object.geometry.computeBoundingSphere();
      sphere = object.geometry.boundingSphere;
    }
    if (sphere === null) return;
    // Terrain-sized meshes cost tens of milliseconds to cast without a BVH; the physics ray
    // already covers ground, so only slabs, roads and props are refined here.
    const geometry = object.geometry;
    const triangles = (geometry.index?.count ?? geometry.attributes["position"]?.count ?? 0) / 3;
    if (triangles > SURFACE_MAX_TRIANGLES) return;
    boundsScratch.copy(sphere).applyMatrix4(object.matrixWorld);
    const along = alongScratch.subVectors(boundsScratch.center, ray.origin).dot(ray.direction);
    if (along < -boundsScratch.radius || along > far + boundsScratch.radius) return;
    if (ray.distanceSqToPoint(boundsScratch.center) > boundsScratch.radius * boundsScratch.radius) return;
    try {
      object.raycast(surfaceRay, hits);
    } catch {
      // A custom mesh that cannot be cast is skipped.
    }
  });
  hits.sort((a, b) => a.distance - b.distance);
  for (const hit of hits) {
    const object = hit.object as THREE.Mesh & { isSkinnedMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
    if (object === skip || object.isSkinnedMesh === true || object.isPoints === true || object.isLine === true || object.isSprite === true) continue;
    if (!object.visible || hit.face === null || hit.face === undefined) continue;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    if (material === undefined || material.transparent || !material.visible) continue;
    const normal = hit.face.normal.clone();
    if (hit.instanceId !== undefined && (object as THREE.InstancedMesh).isInstancedMesh === true) {
      (object as THREE.InstancedMesh).getMatrixAt(hit.instanceId, instanceScratch);
      normal.transformDirection(instanceScratch);
    }
    normal.transformDirection(object.matrixWorld);
    if (normal.dot(surfaceRay.ray.direction) > 0) normal.negate();
    return { point: [hit.point.x, hit.point.y, hit.point.z], normal: [normal.x, normal.y, normal.z], distance: hit.distance };
  }
  return null;
}
/**
 * A landed shot's impact class from its weapon first, then its effect: a game's `classes` entry for
 * either wins, then a weapon name that reads as a class (`grenade_pineapple` → explosive), then the
 * effect id. Exported for tests. @internal
 */
export function classFor(item: string, effect: string, classes?: Readonly<Record<string, ImpactClass>>): ImpactClass {
  const explicit = classes?.[item] ?? classes?.[effect];
  if (explicit !== undefined) return explicit;
  const byItem = impactClassFor(item);
  return byItem === "light" ? impactClassFor(effect) : byItem;
}

const scratch = { matrix: new THREE.Matrix4(), scale: new THREE.Vector3(), spin: new THREE.Quaternion(), normal: new THREE.Vector3() };

/** Props the impact draw reads; resolved by the React wrapper each commit. */
export interface ImpactFeedbackDrawProps extends ImpactFeedbackOptions {
  ctx: GameContext;
  quality: GraphicsQuality;
  reducedMotion: boolean;
}

function markLimit(props: ImpactFeedbackDrawProps): number {
  return props.marks === false ? 0 : MARK_LIMIT[props.quality];
}

/**
 * Draw-side form of {@link ImpactFeedback}: every `combat.damage` with a position throws sparks and
 * dust sized by its {@link ImpactClass}, a direct-fire shot that misses leaves a scorch mark on the
 * surface it hit, an explosion or crash near the local player kicks the camera and rumbles the pad
 * (no kick with reduced motion), and the local player's heavy hits, hits taken and kills stop the
 * game clock for a few dozen milliseconds. Damage over time (status ticks) is quiet. Marks are off
 * on the `low` graphics tier. Event handlers read the latest props per event; only a `ctx` swap
 * resubscribes, matching the old effect deps.
 * @internal
 */
export function impactFeedbackDraw(getProps: () => ImpactFeedbackDrawProps): EngineDraw {
  const list: Mark[] = [];
  const dirty = { current: false };
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial({
    map: markTexture(),
    transparent: true,
    depthWrite: false,
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  // The raycast scene is the rendered root; the marks mesh parents under the scoped mount
  // parent so it keeps the postfx overlay grouping it had as a JSX child.
  let scene: THREE.Scene | null = null;
  let host: THREE.Object3D | null = null;
  let camera: THREE.Camera | null = null;
  let mesh: THREE.InstancedMesh | null = null;
  let meshLimit = -1;
  let subscribedCtx: GameContext | null = null;
  let stop: ReturnType<typeof createHitstop> | null = null;
  const offHandlers: (() => void)[] = [];
  let disposeProbe: (() => void) | null = null;

  const syncMesh = () => {
    const limit = markLimit(getProps());
    if (limit === meshLimit) return;
    meshLimit = limit;
    if (mesh !== null) {
      host?.remove(mesh);
      mesh.dispose();
      mesh = null;
    }
    if (limit > 0 && host !== null) {
      mesh = new THREE.InstancedMesh(geometry, material, limit);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      host.add(mesh);
    }
  };

  const subscribe = (ctx: GameContext) => {
    stop = createHitstop(ctx.time);
    const player = ctx.player.userId;
    let lastKick = -Infinity;
    let lastRefine = -Infinity;
    const burst = (cls: ImpactClass, at: readonly [number, number, number]) => {
      const props = getProps();
      const profile = IMPACT_PROFILES[cls];
      const position: [number, number, number] = [at[0], at[1], at[2]];
      if (profile.sparks !== null) ctx.particles.play(profile.sparks.effect, { position, burst: profile.sparks.count });
      if (profile.dust !== null) ctx.particles.play(profile.dust.effect, { position, burst: profile.dust.count });
      stats.bursts += 1;
      if (profile.kick <= 0) return;
      const self = ctx.scene.entity.get(ctx.player.possession.active(player) ?? player);
      if (self === null || self === undefined) return;
      const now = performance.now();
      if (now - lastKick < KICK_GAP_MS) return;
      const kick = impactKick(profile, Math.hypot(at[0] - self.position[0], at[1] - self.position[1], at[2] - self.position[2]));
      if (kick <= 0) return;
      lastKick = now;
      stats.kicks += 1;
      if (!props.reducedMotion) cameraShake(kick);
      ctx.input.haptics(player).pulse("impact", { strong: Math.min(1, kick * 1.6), weak: Math.min(1, kick), ms: 120 + kick * 300 }, 3);
    };
    offHandlers.push(ctx.game.events.on("combat.damage", (event) => {
      const props = getProps();
      if (event.status !== undefined || event.amount <= 0) return;
      const target = ctx.scene.entity.get(event.target);
      const at = event.position ?? (target === null ? undefined : ([target.position[0], target.position[1] + 1, target.position[2]] as const));
      const cls = impactClassFor(event.type, props.classes);
      if (at !== undefined) burst(cls, at);
      if (props.hitstop === false || (event.source !== player && event.target !== player)) return;
      const profile = IMPACT_PROFILES[cls];
      const ms = event.lethal && event.target !== player ? profile.killHitstopMs : profile.hitstopMs;
      if (ms > 0) stats.hitstops += 1;
      stop?.start(ms, performance.now());
    }));
    offHandlers.push(ctx.game.events.on("projectile.settled", (event) => {
      const props = getProps();
      const limit = markLimit(props);
      // A direct hit is drawn by its combat.damage; an arced shot also bursts where it landed.
      if (event.hit && !event.ballistic) return;
      // The weapon names the impact better than the effect ("grenade_pineapple" vs "damage").
      const cls = event.impact ?? (event.item === undefined ? impactClassFor(event.effect, props.classes) : classFor(event.item, event.effect, props.classes));
      const profile = IMPACT_PROFILES[cls];
      // An arced shot lands where it settled; look straight down there for the surface.
      const from = event.ballistic ? ([event.at[0], event.at[1] + 1, event.at[2]] as const) : event.origin;
      const dx = event.at[0] - from[0];
      const dy = event.at[1] - from[1];
      const dz = event.at[2] - from[2];
      const length = Math.hypot(dx, dy, dz);
      let point: readonly [number, number, number] = event.at;
      let normal: readonly [number, number, number] | null = null;
      if (length > 1e-3 && scene !== null && camera !== null) {
        const hit = ctx.scene.raycast({
          origin: from,
          direction: [dx / length, dy / length, dz / length],
          maxDistance: length + 0.5,
          filter: { entities: false, objects: true, walls: true, terrain: true },
        });
        const direction = [dx / length, dy / length, dz / length] as const;
        // Only the last stretch before the physics hit is tested against drawn meshes, so a shot costs
        // a short ray through the few objects near where it landed, not the whole scene.
        let drawn: ReturnType<typeof drawnSurfaceHit> = null;
        const refineAt = performance.now();
        if (hit !== null && limit > 0 && profile.markSize > 0 && refineAt - lastRefine >= SURFACE_GAP_MS) {
          lastRefine = refineAt;
          const back = Math.min(hit.distance, SURFACE_LOOKBACK_M);
          const start = [hit.point[0] - direction[0] * back, hit.point[1] - direction[1] * back, hit.point[2] - direction[2] * back] as const;
          const started = performance.now();
          drawn = drawnSurfaceHit(scene, start, direction, back + 0.05, mesh, camera);
          if (drawn !== null) drawn.distance += hit.distance - back;
          const spent = performance.now() - started;
          stats.surfaceMsMax = Math.max(stats.surfaceMsMax, spent);
          stats.surfaceMsLast = spent;
        }
        if (hit !== null) {
          point = hit.point;
          normal = hit.normal;
        }
        if (drawn !== null && (hit === null || drawn.distance <= hit.distance + 0.05)) {
          point = drawn.point;
          normal = drawn.normal;
        }
      }
      burst(cls, point);
      if (normal === null) stats.missedSurface += 1;
      if (limit === 0 || normal === null || profile.markSize <= 0) return;
      const n = scratch.normal.set(normal[0], normal[1], normal[2]).normalize();
      const quaternion = new THREE.Quaternion().setFromUnitVectors(Z, n).multiply(scratch.spin.setFromAxisAngle(Z, Math.random() * Math.PI * 2));
      list.push({ born: performance.now() / 1000, size: profile.markSize * (0.8 + Math.random() * 0.4), position: new THREE.Vector3(point[0], point[1], point[2]).addScaledVector(n, 0.03), quaternion });
      if (list.length > limit) list.splice(0, list.length - limit);
      stats.marks += 1;
      dirty.current = true;
    }));
  };

  const syncSubscription = () => {
    const ctx = getProps().ctx;
    if (ctx === subscribedCtx) return;
    for (const off of offHandlers.splice(0)) off();
    subscribedCtx = ctx;
    subscribe(ctx);
  };

  return {
    mount(state: EngineFrameState) {
      scene = state.rootScene ?? state.scene;
      host = state.scene;
      camera = state.camera;
      syncMesh();
      syncSubscription();
      disposeProbe = devtools.probes.registerSystem("render/impacts", {
        counters: () => ({ ...stats, live: list.length }),
        state: () => `${stats.bursts} bursts · ${list.length} marks · ${stats.kicks} kicks · ${stats.hitstops} hit-stops`,
      });
    },
    update() {
      syncMesh();
      syncSubscription();
    },
    frame() {
      const now = performance.now();
      stop?.tick(now);
      const instanced = mesh;
      if (instanced === null) return;
      const seconds = now / 1000;
      while (list.length > 0 && seconds - list[0]!.born > MARK_LIFE_S) {
        list.shift();
        dirty.current = true;
      }
      const fading = list.length > 0 && seconds - list[0]!.born > MARK_LIFE_S - MARK_FADE_S;
      if (!dirty.current && !fading) return;
      for (let i = 0; i < list.length; i += 1) {
        const mark = list[i]!;
        const fade = Math.min(1, (MARK_LIFE_S - (seconds - mark.born)) / MARK_FADE_S);
        scratch.scale.setScalar(mark.size * Math.max(0, fade));
        instanced.setMatrixAt(i, scratch.matrix.compose(mark.position, mark.quaternion, scratch.scale));
      }
      instanced.count = list.length;
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      dirty.current = false;
    },
    dispose() {
      for (const off of offHandlers.splice(0)) off();
      subscribedCtx = null;
      stop = null;
      disposeProbe?.();
      disposeProbe = null;
      if (mesh !== null) {
        host?.remove(mesh);
        mesh.dispose();
        mesh = null;
      }
      meshLimit = -1;
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
      scene = null;
      host = null;
      camera = null;
    },
  };
}

/**
 * The engine's default impact layer, mounted with the combat presentation: every `combat.damage`
 * with a position throws sparks and dust sized by its {@link ImpactClass}, a direct-fire shot that
 * misses leaves a scorch mark on the surface it hit, an explosion or crash near the local player kicks the
 * camera and rumbles the pad (no kick with reduced motion), and the local player's heavy hits, hits taken and
 * kills stop the game clock for a few dozen milliseconds. Damage over time (status ticks) is quiet.
 * Marks are off on the `low` graphics tier.
 */
export function ImpactFeedback(props: ImpactFeedbackOptions) {
  const ctx = useGameContext();
  const quality = useTerrainQuality();
  const reducedMotion = useAccessibilitySettings().reducedMotion;
  const latest = useRef<ImpactFeedbackDrawProps>({ ctx, quality, reducedMotion, classes: props.classes, marks: props.marks, hitstop: props.hitstop });
  latest.current = { ctx, quality, reducedMotion, classes: props.classes, marks: props.marks, hitstop: props.hitstop };
  return <EngineDrawMount create={() => impactFeedbackDraw(() => latest.current)} deps={[ctx]} />;
}
