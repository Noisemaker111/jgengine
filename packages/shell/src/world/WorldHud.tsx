import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { CombatTelegraphEvent, EntityFloatTextEvent } from "@jgengine/core/game/events";
import type { TelegraphShape } from "@jgengine/core/combat/telegraph";
import type { CatalogEntityRole } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/react/provider";
import { useCameraShake } from "../camera/shakeChannel";
import { CALIBRATED_TRAUMA_SHAKE_DECAY_PER_SECOND } from "../camera/rigMath";
import { readFirstPersonMuzzle } from "../camera/GameFirstPersonCamera";
import { resolveFloatTextStyle } from "./floatTextStyle";
import {
  collectNameplateSamples,
  collectWorldBarSamples,
  paintWorldBarSamples,
  type NameplateSample,
  type WorldBarSample,
} from "./worldBarSamples";
import { telegraphPulseOpacity } from "./telegraphPulse";

export type { NameplateSample, WorldBarSample } from "./worldBarSamples";
export { collectNameplateSamples, collectWorldBarSamples, paintWorldBarSamples } from "./worldBarSamples";
export { telegraphPulseOpacity } from "./telegraphPulse";

function pinOverlayToViewport(
  _el: THREE.Object3D,
  _camera: THREE.Camera,
  size: { width: number; height: number },
): [number, number] {
  return [size.width / 2, size.height / 2];
}

export function WorldEntityBars({
  statId,
  height = 2.2,
  roles,
  resolveRole,
  maxDistance = 60,
}: {
  statId: string;
  height?: number;
  roles?: readonly CatalogEntityRole[];
  resolveRole?: (entity: SceneEntity) => CatalogEntityRole | undefined;
  /** Hide bars for entities farther than this from the player (world units). Default 60. */
  maxDistance?: number;
}) {
  const ctx = useGameContext();
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samplesRef = useRef<WorldBarSample[]>([]);
  const projectRef = useRef(new THREE.Vector3());

  useFrame(() => {
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
    collectWorldBarSamples(
      ctx,
      statId,
      height,
      roles,
      resolveRole,
      camera,
      { width: cssW, height: cssH },
      samplesRef.current,
      projectRef.current,
      maxDistance,
    );
    paintWorldBarSamples(canvas, samplesRef.current, dpr);
  });

  return (
    <Html fullscreen calculatePosition={pinOverlayToViewport} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
      />
    </Html>
  );
}

/** Props for `WorldNameplates` — entity filter, refresh rate, and headless className/render hooks. */
export interface WorldNameplatesProps {
  statId?: string;
  height?: number;
  roles?: readonly CatalogEntityRole[];
  resolveRole?: (entity: SceneEntity) => CatalogEntityRole | undefined;
  /** Hide nameplates for entities farther than this from the player (world units). Default 40. */
  maxDistance?: number;
  /** Minimum ms between position/health refreshes — trades smoothness for fewer re-renders at scale. Default 120. */
  tickMs?: number;
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
  maxDistance = 40,
  tickMs = 120,
  showHealth = true,
  className,
  nameplateClassName,
  nameClassName,
  barClassName,
  fillClassName,
  renderNameplate,
}: WorldNameplatesProps) {
  const ctx = useGameContext();
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const [samples, setSamples] = useState<readonly NameplateSample[]>([]);
  const samplesRef = useRef<NameplateSample[]>([]);
  const projectRef = useRef(new THREE.Vector3());
  const lastTickRef = useRef(0);

  useFrame((state) => {
    const nowMs = state.clock.elapsedTime * 1000;
    if (nowMs - lastTickRef.current < tickMs) return;
    lastTickRef.current = nowMs;
    camera.updateMatrixWorld();
    collectNameplateSamples(
      ctx,
      statId,
      height,
      roles,
      resolveRole,
      camera,
      { width: size.width, height: size.height },
      samplesRef.current,
      projectRef.current,
      maxDistance,
    );
    setSamples([...samplesRef.current]);
  });

  return (
    <Html fullscreen calculatePosition={pinOverlayToViewport} zIndexRange={[19, 0]} style={{ pointerEvents: "none" }}>
      <div className={className} data-nameplates>
        {samples.map((sample) =>
          renderNameplate !== undefined ? (
            <div key={sample.id} style={{ position: "absolute", left: sample.x, top: sample.y }}>
              {renderNameplate(sample)}
            </div>
          ) : (
            <div
              key={sample.id}
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
    </Html>
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
  const [ids, setIds] = useState<readonly string[]>(() => ctx.scene.object.selection.list());
  useEffect(() => {
    setIds(ctx.scene.object.selection.list());
    return ctx.subscribe(() => setIds(ctx.scene.object.selection.list()));
  }, [ctx]);
  return (
    <>
      {ids.map((id) => {
        const object = ctx.scene.object.get(id);
        if (object === null) return null;
        const halfExtents = ctx.scene.object.catalog(id)?.halfExtents;
        const ringRadius =
          radius ?? (halfExtents === undefined ? 1.2 : Math.max(halfExtents[0], halfExtents[2]) * 1.35);
        return (
          <mesh
            key={id}
            position={[object.position[0], object.position[1] + y, object.position[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={998}
          >
            <ringGeometry args={[ringRadius * 0.82, ringRadius, 40]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

interface Floater {
  id: number;
  position: [number, number, number];
  event: EntityFloatTextEvent;
}

function FloatTextItem({ event, lifeMs }: { event: EntityFloatTextEvent; lifeMs: number }) {
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
}

export function WorldFloatText({ height = 1.9, lifeMs = 950 }: { height?: number; lifeMs?: number }) {
  const ctx = useGameContext();
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<number>());
  useEffect(() => {
    const pending = timers.current;
    const off = ctx.game.events.on("entity.floatText", (event) => {
      const id = nextId.current++;
      setFloaters((current) => [...current, { id, position: event.position, event }]);
      const timer = window.setTimeout(() => {
        pending.delete(timer);
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
  return (
    <>
      {floaters.map((floater) => (
        <Html
          key={floater.id}
          position={[floater.position[0], floater.position[1] + height, floater.position[2]]}
          center
          distanceFactor={12}
          zIndexRange={[30, 0]}
        >
          <FloatTextItem event={floater.event} lifeMs={lifeMs} />
        </Html>
      ))}
    </>
  );
}

interface ActiveTelegraph {
  key: number;
  event: CombatTelegraphEvent;
  bornMs: number;
}

function TelegraphGeometry({ shape }: { shape: TelegraphShape }) {
  if (shape.kind === "circle") return <circleGeometry args={[shape.radius, 48]} />;
  if (shape.kind === "ring") return <ringGeometry args={[shape.innerRadius, shape.radius, 48]} />;
  if (shape.kind === "cone") return <circleGeometry args={[shape.radius, 40, -shape.angle / 2, shape.angle]} />;
  return <planeGeometry args={[shape.width, shape.length]} />;
}

function TelegraphDecal({ active }: { active: ActiveTelegraph }) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const [x, y, z] = active.event.position;
  const dir = active.event.dir ?? 0;
  const shape = active.event.shape;
  const forwardOffset = shape.kind === "line" ? shape.length / 2 : 0;
  const color = active.event.kind === "danger" ? "#ef4444" : "#f59e0b";
  useFrame(() => {
    const material = materialRef.current;
    if (material === null) return;
    material.opacity = telegraphPulseOpacity(active.bornMs, active.event.windupMs, performance.now());
  });
  return (
    <mesh
      position={[x + Math.sin(dir) * forwardOffset, y + 0.06, z + Math.cos(dir) * forwardOffset]}
      rotation={[-Math.PI / 2, 0, shape.kind === "line" || shape.kind === "cone" ? -dir : 0]}
      renderOrder={999}
    >
      <TelegraphGeometry shape={shape} />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={0.45}
        side={THREE.DoubleSide}
        depthWrite={false}
        depthTest={false}
        toneMapped={false}
      />
    </mesh>
  );
}

export function WorldTelegraphs() {
  const ctx = useGameContext();
  const [telegraphs, setTelegraphs] = useState<ActiveTelegraph[]>([]);
  const key = useRef(0);
  const timers = useRef(new Set<number>());
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
  return (
    <>
      {telegraphs.map((active) => (
        <TelegraphDecal key={active.key} active={active} />
      ))}
    </>
  );
}

export function CombatCameraShake() {
  const ctx = useGameContext();
  const shake = useCameraShake();
  useEffect(() => {
    return ctx.game.events.on("combat.hitReaction", (event) => {
      if (event.trauma !== undefined) {
        shake.shake(event.trauma, CALIBRATED_TRAUMA_SHAKE_DECAY_PER_SECOND);
        return;
      }
      if (event.shake === undefined) return;
      shake.shake(event.shake.amplitude, event.shake.decay);
    });
  }, [ctx, shake]);
  return null;
}

interface Tracer {
  id: number;
  points: [THREE.Vector3, THREE.Vector3];
}

export function ProjectileTracers({ lifeMs = 130 }: { lifeMs?: number }) {
  const ctx = useGameContext();
  const [tracers, setTracers] = useState<Tracer[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const unsub = ctx.game.events.on("projectile.settled", (event) => {
      const id = nextId.current++;
      const start = new THREE.Vector3(event.origin[0], event.origin[1], event.origin[2]);
      if (event.from === ctx.player.userId) readFirstPersonMuzzle(start);
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
  }, [ctx, lifeMs]);
  return (
    <>
      {tracers.map((tracer) => (
        <Line key={tracer.id} points={tracer.points} color="#fde68a" lineWidth={2} transparent opacity={0.85} />
      ))}
    </>
  );
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
