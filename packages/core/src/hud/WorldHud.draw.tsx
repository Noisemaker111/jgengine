/** @jsxImportSource @jgengine/core/ui/jsx */
import { HudOverlay } from "./hudOverlay.draw";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import * as THREE from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { CombatTelegraphEvent, EntityFloatTextEvent } from "@jgengine/core/game/events";
import type { TelegraphShape } from "@jgengine/core/combat/telegraph";
import type { CatalogEntityRole } from "@jgengine/core/runtime/gameContext";
import { useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { readFirstPersonMuzzle } from "@jgengine/core/camera/GameFirstPersonCamera.draw";
import { readEntityMuzzle } from "@jgengine/core/anim/entityMuzzle.draw";
import { resolveFloatTextStyle } from "@jgengine/core/hud/floatTextStyle";
import {
  collectNameplateSamples,
  collectWorldBarSamples,
  createOverlayRangeWarn,
  deriveWorldBarRange,
  nearestOverlayTargetDistance,
  paintWorldBarSamples,
  refreshWorldBarSamples,
  worldBarTargetFilter,
  worldNameplateTargetFilter,
  type NameplateSample,
  type WorldBarSample,
} from "@jgengine/core/hud/barSamples.draw";
import { telegraphDecalPose, telegraphPulseOpacity } from "@jgengine/core/combat/telegraphPulse";
import { useRenderVisibility } from "@jgengine/core/visibility/CullingProvider.draw";
import { CAMERA_POST_FRAME_PRIORITY } from "@jgengine/core/camera/cameraRigs.draw";
import { useFrameTask } from "@jgengine/core/frame/useFrameTask.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";
import { type EngineDraw, type EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineHost } from "@jgengine/core/frame/engineHost.draw";

export type { NameplateSample, WorldBarSample } from "@jgengine/core/hud/barSamples.draw";
export { collectNameplateSamples, collectWorldBarSamples, paintWorldBarSamples } from "@jgengine/core/hud/barSamples.draw";
export { telegraphPulseOpacity } from "@jgengine/core/combat/telegraphPulse";

interface RangeWarnState {
  warn: ReturnType<typeof createOverlayRangeWarn>;
  reported: boolean;
  at: number;
}

/**
 * A configured range that hides every overlay is a silent blank screen; measure the nearest
 * on-screen target and name the prop to raise. Probes at most once a second and reports once.
 */
function reportHiddenRange(
  ref: { current: RangeWarnState | null },
  block: string,
  configured: number,
  measure: () => number | null,
): void {
  const state = (ref.current ??= { warn: createOverlayRangeWarn(), reported: false, at: -Infinity });
  if (state.reported) return;
  const now = performance.now();
  if (now - state.at < 1000) return;
  state.at = now;
  const nearest = measure();
  if (nearest === null) return;
  state.reported = true;
  const message = state.warn(block, configured, nearest);
  if (message !== null) console.warn(message);
}

export function WorldEntityBars({
  statId,
  height = 2.2,
  roles,
  resolveRole,
  maxDistance,
  occlude = true,
  tickMs = 80,
  maxSamples = 64,
}: {
  statId: string;
  height?: number;
  roles?: readonly CatalogEntityRole[] | undefined;
  resolveRole?: (entity: SceneEntity) => CatalogEntityRole | undefined;
  /** Hide bars beyond this camera distance in world units. Unset derives the range from the camera and the target height. */
  maxDistance?: number;
  /** Hide bars behind blocking geometry from the render camera. Default true; false explicitly reveals through walls. */
  occlude?: boolean;
  /** Minimum visibility/health refresh interval in ms; anchors reproject every frame. Default 80. */
  tickMs?: number;
  /** Maximum overlays and occlusion rays per refresh. Default 64, capped at 256. */
  maxSamples?: number;
}) {
  const ctx = useGameContext();
  const host = useEngineHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samplesRef = useRef<WorldBarSample[]>([]);
  const projectRef = useRef(new THREE.Vector3());
  const lastTickRef = useRef(-Infinity);
  const warnRef = useRef<RangeWarnState | null>(null);
  const visibility = useRenderVisibility();

  useFrameTask((state) => {
    const { camera, gl, size } = host.frame;
    const nowMs = state.clock.elapsedTime * 1000;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const dpr = Math.min(2, gl.getPixelRatio());
    const cssW = size.width;
    const cssH = size.height;
    const pixelW = Math.max(1, Math.floor(cssW * dpr));
    const pixelH = Math.max(1, Math.floor(cssH * dpr));
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }
    camera.updateMatrixWorld();
    const viewport = { width: cssW, height: cssH };
    const range = maxDistance ?? deriveWorldBarRange(camera, viewport, height);
    if (nowMs - lastTickRef.current >= Math.max(0, tickMs)) {
      lastTickRef.current = nowMs;
      collectWorldBarSamples(
        ctx,
        statId,
        height,
        roles,
        resolveRole,
        camera,
        viewport,
        samplesRef.current,
        projectRef.current,
        range,
        occlude,
        { maxSamples, isVisible: visibility.current },
      );
      if (maxDistance !== undefined && samplesRef.current.length === 0) {
        reportHiddenRange(warnRef, "worldHealthBars", maxDistance, () =>
          nearestOverlayTargetDistance(
            ctx,
            camera,
            height,
            deriveWorldBarRange(camera, viewport, height),
            projectRef.current,
            { maxSamples, isVisible: visibility.current },
            worldBarTargetFilter(ctx, statId, roles, resolveRole),
          ),
        );
      }
    } else {
      refreshWorldBarSamples(ctx, height, camera, viewport, samplesRef.current, projectRef.current, range, { isVisible: visibility.current });
    }
    paintWorldBarSamples(canvas, samplesRef.current, dpr);
  }, CAMERA_POST_FRAME_PRIORITY + 0.01);

  return (
    <HudOverlay zIndex={20}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
      />
    </HudOverlay>
  );
}

/** Props for `WorldNameplates` — entity filter, refresh rate, and headless className/render hooks. */
export interface WorldNameplatesProps {
  statId?: string;
  height?: number;
  roles?: readonly CatalogEntityRole[] | undefined;
  resolveRole?: (entity: SceneEntity) => CatalogEntityRole | undefined;
  /** Hide nameplates beyond this camera distance in world units. Unset derives the range from the camera and the plate height. */
  maxDistance?: number;
  /** Hide plates behind blocking geometry from the render camera. Default true; false explicitly reveals through walls. */
  occlude?: boolean;
  /** Minimum ms between position/health refreshes — trades smoothness for fewer re-renders at scale. Default 120. */
  tickMs?: number;
  /** Maximum overlays and occlusion rays per refresh. Default 64, capped at 256. */
  maxSamples?: number;
  /** Authored display name. Return null to omit a plate; default suppresses machine identifiers. */
  resolveName?: (entity: SceneEntity) => string | null;
  /** Draw the built-in HP bar under the name. Set `false` for a name-only plate when the game already draws its own health bar (its own HUD, or `worldHealthBars`). Default true. */
  showHealth?: boolean;
  className?: string;
  nameplateClassName?: string;
  nameClassName?: string;
  barClassName?: string;
  fillClassName?: string;
  /** Full override for one nameplate's markup; receives the raw sample (name, percent, screen x/y). */
  renderNameplate?: (sample: NameplateSample) => ReactNode;
}

/** The same plates with the same names and health: a plate the camera moved needs no render. */
function samePlates(previous: readonly NameplateSample[], next: readonly NameplateSample[]): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index += 1) {
    const a = previous[index], b = next[index];
    if (a === undefined || b === undefined || a.id !== b.id || a.name !== b.name || a.percent !== b.percent) return false;
  }
  return true;
}

/**
 * Billboarded name + 78×6px HP bar over every nearby non-local entity that
 * passes `roles`/`maxDistance` — headless (className/data-* slots on every
 * part, `renderNameplate` for a full swap), turned on declaratively via
 * `defineGame({ nameplates })` rather than mounted by hand.
 *
 * @capability nameplates billboarded name + HP bar over nearby entities
 */
export function WorldNameplates({
  statId = "health",
  height = 2.3,
  roles,
  resolveRole,
  maxDistance,
  occlude = true,
  tickMs = 120,
  maxSamples = 64,
  resolveName,
  showHealth = true,
  className,
  nameplateClassName,
  nameClassName,
  barClassName,
  fillClassName,
  renderNameplate,
}: WorldNameplatesProps) {
  const ctx = useGameContext();
  const host = useEngineHost();
  const [samples, setSamples] = useState<readonly NameplateSample[]>([]);
  const samplesRef = useRef<NameplateSample[]>([]);
  const shownRef = useRef<readonly NameplateSample[]>([]);
  const platesRef = useRef(new Map<string, HTMLDivElement>());
  const projectRef = useRef(new THREE.Vector3());
  const lastTickRef = useRef(-Infinity);
  const warnRef = useRef<RangeWarnState | null>(null);
  const visibility = useRenderVisibility();

  useFrameTask((state) => {
    const { camera, size } = host.frame;
    const nowMs = state.clock.elapsedTime * 1000;
    if (nowMs - lastTickRef.current < Math.max(0, tickMs)) return;
    lastTickRef.current = nowMs;
    camera.updateMatrixWorld();
    const viewport = { width: size.width, height: size.height };
    collectNameplateSamples(
      ctx,
      statId,
      height,
      roles,
      resolveRole,
      camera,
      viewport,
      samplesRef.current,
      projectRef.current,
      maxDistance ?? deriveWorldBarRange(camera, viewport, height),
      occlude,
      { maxSamples, isVisible: visibility.current, ...(resolveName === undefined ? {} : { resolveName }) },
    );
    if (maxDistance !== undefined && samplesRef.current.length === 0) {
      reportHiddenRange(warnRef, "nameplates", maxDistance, () =>
        nearestOverlayTargetDistance(
          ctx,
          camera,
          height,
          deriveWorldBarRange(camera, viewport, height),
          projectRef.current,
          { maxSamples, isVisible: visibility.current, ...(resolveName === undefined ? {} : { resolveName }) },
          worldNameplateTargetFilter(roles, resolveRole, resolveName),
        ),
      );
    }
    const next = samplesRef.current;
    if (renderNameplate !== undefined || !samePlates(shownRef.current, next)) {
      shownRef.current = next.map((sample) => ({ ...sample }));
      setSamples(shownRef.current);
      return;
    }
    // Same plates: only the camera moved them, so move their nodes without a render.
    for (const sample of next) {
      const node = platesRef.current.get(sample.id);
      if (node === undefined) continue;
      node.style.left = `${sample.x}px`;
      node.style.top = `${sample.y}px`;
    }
  }, CAMERA_POST_FRAME_PRIORITY + 0.01);

  return (
    <HudOverlay zIndex={19}>
      <div className={className} data-nameplates>
        {samples.map((sample) =>
          renderNameplate !== undefined ? (
            <div key={sample.id} style={{ position: "absolute", left: sample.x, top: sample.y }}>
              {renderNameplate(sample)}
            </div>
          ) : (
            <div
              key={sample.id}
              ref={(node) => { if (node === null) platesRef.current.delete(sample.id); else platesRef.current.set(sample.id, node); }}
              className={nameplateClassName}
              data-nameplate={sample.id}
              style={{
                position: "absolute",
                left: sample.x,
                top: sample.y,
                transform: "translate(-50%, -100%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
              }}
            >
              <span
                className={nameClassName}
                data-nameplate-name
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#f1f5f9",
                  textShadow: "0 1px 3px rgba(0,0,0,0.9)",
                  whiteSpace: "nowrap",
                }}
              >
                {sample.name}
              </span>
              {showHealth && sample.percent !== null ? (
                <span
                  className={barClassName}
                  data-nameplate-bar
                  style={{
                    display: "block",
                    width: 78,
                    height: 6,
                    borderRadius: 2,
                    background: "rgba(0,0,0,0.65)",
                    border: "1px solid rgba(0,0,0,0.8)",
                    overflow: "hidden",
                  }}
                >
                  <span
                    className={fillClassName}
                    data-nameplate-fill
                    style={{
                      display: "block",
                      width: `${sample.percent * 100}%`,
                      height: "100%",
                      background: sample.percent > 0.5 ? "#22c55e" : sample.percent > 0.25 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </span>
              ) : null}
            </div>
          ),
        )}
      </div>
    </HudOverlay>
  );
}

/** Props for {@link WorldObjectHighlights}. */
export interface WorldObjectHighlightsProps {
  /** Ring tint. Default a construction-select amber. */
  color?: string;
  /** Fixed ring radius; omitted derives one from the object's catalog `halfExtents` (falls back to 1.2). */
  radius?: number;
  /** Ground offset so the ring doesn't z-fight the object's base. Default 0.05. */
  y?: number;
}

/**
 * Ground ring over every `ctx.scene.object.selection`-ed placed object — the object-layer counterpart
 * to `WorldEntityBars`/`WorldNameplates`. Mount it once in the game's scene (headless: no defaults are
 * imposed beyond a visible ring) instead of hand-rolling a selection highlight through `WorldOverlay`
 * against external state.
 *
 * @capability world-object-highlights ground-ring highlight over every selected placed object
 */
export function WorldObjectHighlights({ color = "#facc15", radius, y = 0.05 }: WorldObjectHighlightsProps) {
  const ctx = useGameContext();
  const ids = useGameStore((c): readonly string[] => c.scene.object.selection.list());
  const latest = useRef({ ids, color, radius, y, ctx });
  latest.current = { ids, color, radius, y, ctx };
  return <EngineDrawMount create={() => worldObjectHighlightsDraw(latest)} deps={[latest]} />;
}

/** Ground rings over every selected placed object — one draw reconciling ring meshes per id. */
function worldObjectHighlightsDraw(latest: {
  current: {
    ids: readonly string[];
    color: string;
    radius: number | undefined;
    y: number;
    ctx: GameContext;
  };
}): EngineDraw {
  const rings = new Map<string, THREE.Mesh>();
  const group = new THREE.Group();
  group.renderOrder = 998;
  let built: { ids: readonly string[]; color: string; radius: number | undefined; y: number } | null = null;

  const build = () => {
    const { ids, color, radius, y, ctx } = latest.current;
    for (const [id, mesh] of rings) {
      if (!ids.includes(id)) {
        group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        rings.delete(id);
      }
    }
    for (const id of ids) {
      if (rings.has(id)) continue;
      const object = ctx.scene.object.get(id);
      if (object === null) continue;
      const halfExtents = ctx.scene.object.catalog(id)?.halfExtents;
      const ringRadius =
        radius ?? (halfExtents === undefined ? 1.2 : Math.max(halfExtents[0], halfExtents[2]) * 1.35);
      const geometry = new THREE.RingGeometry(ringRadius * 0.82, ringRadius, 40);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(object.position[0], object.position[1] + y, object.position[2]);
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.renderOrder = 998;
      rings.set(id, mesh);
      group.add(mesh);
    }
    built = { ids, color, radius, y };
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
      build();
    },
    update(_state: EngineFrameState) {
      const { ids, color, radius, y } = latest.current;
      const same =
        built !== null &&
        built.color === color &&
        built.radius === radius &&
        built.y === y &&
        built.ids.length === ids.length &&
        built.ids.every((id, index) => ids[index] === id);
      if (!same) build();
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      for (const mesh of rings.values()) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      rings.clear();
    },
  };
}

interface Floater {
  id: number;
  position: [number, number, number];
  event: EntityFloatTextEvent;
}

const FloatTextItem = memo(function FloatTextItem({ event, lifeMs }: { event: EntityFloatTextEvent; lifeMs: number }) {
  const [shown, setShown] = useState(false);
  const style = useMemo(() => resolveFloatTextStyle(event), [event]);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span
      style={{
        display: "inline-block",
        color: style.color,
        fontWeight: style.fontWeight,
        fontSize: `${style.fontSizePx}px`,
        textShadow: style.glow,
        transition: `transform ${lifeMs}ms ease-out, opacity ${lifeMs}ms ease-out`,
        transform: shown ? "translateY(-30px)" : "translateY(0)",
        opacity: shown ? 0 : 1,
      }}
    >
      {event.text}
    </span>
  );
});

export function WorldFloatText({ height = 1.9, lifeMs = 950 }: { height?: number; lifeMs?: number }) {
  const ctx = useGameContext();
  const host = useEngineHost();
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<number>());
  const nodesRef = useRef(new Map<number, HTMLDivElement>());
  const projectRef = useRef(new THREE.Vector3());
  const latest = useRef({ floaters, height });
  latest.current = { floaters, height };
  useEffect(() => {
    const pending = timers.current;
    const off = ctx.game.events.on("entity.floatText", (event) => {
      const id = nextId.current++;
      setFloaters((current) => [...current, { id, position: event.position, event }]);
      const timer = window.setTimeout(() => {
        pending.delete(timer);
        nodesRef.current.delete(id);
        setFloaters((current) => current.filter((floater) => floater.id !== id));
      }, lifeMs);
      pending.add(timer);
    });
    return () => {
      off();
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, [ctx, lifeMs]);
  // Html's position={...} projected every frame; the DOM overlay does the same write directly.
  useFrameTask(() => {
    const { camera, size } = host.frame;
    const { floaters: active, height: lift } = latest.current;
    camera.updateMatrixWorld();
    for (const floater of active) {
      const node = nodesRef.current.get(floater.id);
      if (node === undefined) continue;
      projectRef.current.set(
        floater.position[0],
        floater.position[1] + lift,
        floater.position[2],
      ).project(camera);
      const x = (projectRef.current.x * 0.5 + 0.5) * size.width;
      const y = (-projectRef.current.y * 0.5 + 0.5) * size.height;
      node.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }, CAMERA_POST_FRAME_PRIORITY + 0.02);
  return (
    <HudOverlay zIndex={30}>
      {floaters.map((floater) => (
        <div
          key={floater.id}
          ref={(node) => { if (node === null) nodesRef.current.delete(floater.id); else nodesRef.current.set(floater.id, node); }}
          style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
        >
          <FloatTextItem event={floater.event} lifeMs={lifeMs} />
        </div>
      ))}
    </HudOverlay>
  );
}

interface ActiveTelegraph {
  key: number;
  event: CombatTelegraphEvent;
  bornMs: number;
}

function telegraphGeometry(shape: TelegraphShape): THREE.BufferGeometry {
  if (shape.kind === "circle") return new THREE.CircleGeometry(shape.radius, 48);
  if (shape.kind === "ring") return new THREE.RingGeometry(shape.innerRadius, shape.radius, 48);
  if (shape.kind === "cone") return new THREE.CircleGeometry(shape.radius, 40, -shape.angle / 2, shape.angle);
  return new THREE.PlaneGeometry(shape.width, shape.length);
}

interface TelegraphDecalEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

/** One draw owning every live telegraph decal — reconciles meshes as events arrive and expire. */
function worldTelegraphsDraw(latest: { current: readonly ActiveTelegraph[] }): EngineDraw {
  const group = new THREE.Group();
  const decals = new Map<number, TelegraphDecalEntry>();

  const disposeEntry = (entry: TelegraphDecalEntry) => {
    group.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    entry.material.dispose();
  };

  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame() {
      const active = latest.current;
      const now = performance.now();
      for (const [key, entry] of decals) {
        if (!active.some((t) => t.key === key)) {
          disposeEntry(entry);
          decals.delete(key);
        }
      }
      for (const t of active) {
        const existing = decals.get(t.key);
        if (existing !== undefined) {
          existing.material.opacity = telegraphPulseOpacity(t.bornMs, t.event.windupMs, now);
          continue;
        }
        const shape = t.event.shape;
        const pose = telegraphDecalPose(shape, t.event.position, t.event.dir ?? 0);
        const color = t.event.kind === "danger" ? "#ef4444" : "#f59e0b";
        const material = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.45,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(telegraphGeometry(shape), material);
        mesh.position.set(pose.position[0], pose.position[1], pose.position[2]);
        mesh.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
        mesh.renderOrder = 999;
        decals.set(t.key, { mesh, material });
        group.add(mesh);
      }
    },
    dispose(state: EngineFrameState) {
      for (const entry of decals.values()) disposeEntry(entry);
      decals.clear();
      state.scene.remove(group);
    },
  };
}

export function WorldTelegraphs() {
  const ctx = useGameContext();
  const [telegraphs, setTelegraphs] = useState<ActiveTelegraph[]>([]);
  const key = useRef(0);
  const timers = useRef(new Set<number>());
  const latest = useRef<readonly ActiveTelegraph[]>(telegraphs);
  latest.current = telegraphs;
  useEffect(() => {
    const pending = timers.current;
    const off = ctx.game.events.on("combat.telegraph", (event) => {
      const entry: ActiveTelegraph = { key: key.current++, event, bornMs: performance.now() };
      setTelegraphs((current) => [...current, entry]);
      const timer = window.setTimeout(() => {
        pending.delete(timer);
        setTelegraphs((current) => current.filter((t) => t.key !== entry.key));
      }, event.windupMs + 120);
      pending.add(timer);
    });
    const offCancel = ctx.game.events.on("combat.telegraphCancelled", (event) => {
      setTelegraphs((current) => current.filter((t) => t.event.id !== event.id));
    });
    return () => {
      off();
      offCancel();
      for (const timer of pending) window.clearTimeout(timer);
      pending.clear();
    };
  }, [ctx]);
  return <EngineDrawMount create={() => worldTelegraphsDraw(latest)} deps={[latest]} />;
}

interface Tracer {
  id: number;
  points: [THREE.Vector3, THREE.Vector3];
}

const FIRST_PERSON_GUN = new THREE.Vector3(0.22, -0.2, -0.55);
const scratchForward = new THREE.Vector3();

/**
 * Where a shot's tracer visibly starts. The rule origin (eye or fixed muzzle offset) decides what is
 * hit; the line starts at the shooter's gun: a first-person viewmodel's registered muzzle, else the
 * bottom-right of the view where a held gun sits, and for anyone seen from outside, their registered
 * hand or barrel. Exported for tests.
 */
export function startFromMuzzle(ctx: GameContext, from: string, camera: THREE.Camera, start: THREE.Vector3): void {
  const local = from === ctx.player.userId || from === ctx.player.possession.active(ctx.player.userId);
  if (local && readFirstPersonMuzzle(start, camera)) return;
  // In first person the camera sits inside the shooter, so the line starts where the gun is drawn.
  const eyeDistance = camera.getWorldPosition(scratchForward).distanceTo(start);
  if (local && eyeDistance < 0.9) {
    start.copy(FIRST_PERSON_GUN).applyMatrix4(camera.matrixWorld);
    return;
  }
  readEntityMuzzle(from, start);
}

interface TracerLine {
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
}

/** Tracer lines as one draw reconciling `THREE.Line` objects — the drei `<Line>` replacement. */
function projectileTracersDraw(latest: { current: readonly Tracer[] }): EngineDraw {
  const group = new THREE.Group();
  const lines = new Map<number, TracerLine>();
  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    update(_state: EngineFrameState) {
      const active = latest.current;
      for (const [id, entry] of lines) {
        if (!active.some((t) => t.id === id)) {
          group.remove(entry.line);
          entry.line.geometry.dispose();
          entry.material.dispose();
          lines.delete(id);
        }
      }
      for (const tracer of active) {
        if (lines.has(tracer.id)) continue;
        const material = new THREE.LineBasicMaterial({
          color: "#fde68a",
          transparent: true,
          opacity: 0.9,
        });
        const geometry = new THREE.BufferGeometry().setFromPoints(tracer.points);
        const line = new THREE.Line(geometry, material);
        lines.set(tracer.id, { line, material });
        group.add(line);
      }
    },
    dispose(state: EngineFrameState) {
      for (const entry of lines.values()) {
        entry.line.geometry.dispose();
        entry.material.dispose();
      }
      lines.clear();
      state.scene.remove(group);
    },
  };
}

export function ProjectileTracers({ lifeMs = 200 }: { lifeMs?: number }) {
  const ctx = useGameContext();
  const host = useEngineHost();
  const [tracers, setTracers] = useState<Tracer[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const latest = useRef<readonly Tracer[]>(tracers);
  latest.current = tracers;
  useEffect(() => {
    const unsub = ctx.game.events.on("projectile.settled", (event) => {
      // fireProjectile is a generic seam (bullets, bolts, grenades, launchers). A straight
      // muzzle→impact line only reads as a real shot for direct-fire projectiles; drawing one
      // for an arced/lobbed shot fakes a beam through a path it never flew, so skip those.
      if (event.ballistic) return;
      const id = nextId.current++;
      const start = new THREE.Vector3(event.origin[0], event.origin[1], event.origin[2]);
      startFromMuzzle(ctx, event.from, host.frame.camera, start);
      setTracers((current) => [
        ...current,
        {
          id,
          points: [start, new THREE.Vector3(event.at[0], event.at[1], event.at[2])],
        },
      ]);
      const handle = setTimeout(() => {
        timers.current.delete(handle);
        setTracers((current) => current.filter((tracer) => tracer.id !== id));
      }, lifeMs);
      timers.current.add(handle);
    });
    return () => {
      unsub();
      for (const handle of timers.current) clearTimeout(handle);
      timers.current.clear();
    };
  }, [ctx, host, lifeMs]);
  return <EngineDrawMount create={() => projectileTracersDraw(latest)} deps={[latest]} />;
}

export function Reticle({ className }: { className?: string }) {
  return (
    <div
      className={
        className ?? "pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
      }
    >
      <div className="relative h-6 w-6">
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow" />
        <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-white/80" />
        <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-white/80" />
        <span className="absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 bg-white/80" />
        <span className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-white/80" />
      </div>
    </div>
  );
}
