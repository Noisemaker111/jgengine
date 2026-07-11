import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { CombatTelegraphEvent, EntityFloatTextEvent } from "@jgengine/core/game/events";
import type { TelegraphShape } from "@jgengine/core/combat/telegraph";
import type { CatalogEntityRole } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/react/provider";
import { useCameraShake } from "../camera/shakeChannel";
import { resolveFloatTextStyle } from "./floatTextStyle";
import {
  collectWorldBarSamples,
  paintWorldBarSamples,
  type WorldBarSample,
} from "./worldBarSamples";
import { telegraphPulseOpacity } from "./telegraphPulse";

export type { WorldBarSample } from "./worldBarSamples";
export { collectWorldBarSamples, paintWorldBarSamples } from "./worldBarSamples";
export { telegraphPulseOpacity } from "./telegraphPulse";

const MUZZLE_HEIGHT = 1.4;

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
}: {
  statId: string;
  height?: number;
  roles?: readonly CatalogEntityRole[];
  resolveRole?: (entity: SceneEntity) => CatalogEntityRole | undefined;
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
      setTracers((current) => [
        ...current,
        {
          id,
          points: [
            new THREE.Vector3(event.origin[0], event.origin[1] + MUZZLE_HEIGHT, event.origin[2]),
            new THREE.Vector3(event.at[0], event.at[1], event.at[2]),
          ],
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
