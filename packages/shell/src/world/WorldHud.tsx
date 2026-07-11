import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import type { CombatTelegraphEvent, EntityFloatTextEvent } from "@jgengine/core/game/events";
import type { TelegraphShape } from "@jgengine/core/combat/telegraph";
import { worldHealthBarAllowsRole } from "@jgengine/core/game/playableGame";
import type { CatalogEntityRole } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/react/provider";
import { useEntityStat, useSceneEntities } from "@jgengine/react/hooks";
import { resolveFloatTextStyle } from "./floatTextStyle";

const MUZZLE_HEIGHT = 1.4;

function EntityBar({ entity, statId, height }: { entity: SceneEntity; statId: string; height: number }) {
  const stat = useEntityStat(entity.id, statId);
  if (stat === null) return null;
  const range = stat.max - stat.min;
  const percent = range <= 0 ? 0 : Math.max(0, Math.min(1, (stat.current - stat.min) / range));
  return (
    <Html
      position={[entity.position[0], entity.position[1] + height, entity.position[2]]}
      center
      distanceFactor={12}
      zIndexRange={[20, 0]}
    >
      <div className="h-2.5 w-28 overflow-hidden rounded-sm border border-black/70 bg-black/70 shadow">
        <div
          className="h-full bg-gradient-to-r from-rose-600 to-red-400"
          style={{ width: `${percent * 100}%` }}
        />
      </div>
    </Html>
  );
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
  const entities = useSceneEntities();
  const playerId = ctx.player.userId;
  return (
    <>
      {entities
        .filter((entity) => entity.id !== playerId)
        .filter((entity) => worldHealthBarAllowsRole(roles, resolveRole?.(entity)))
        .map((entity) => (
          <EntityBar key={entity.id} entity={entity} statId={statId} height={height} />
        ))}
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

function TelegraphDecal({ active, nowMs }: { active: ActiveTelegraph; nowMs: number }) {
  const progress = Math.max(0, Math.min(1, (nowMs - active.bornMs) / active.event.windupMs));
  const [x, y, z] = active.event.position;
  const dir = active.event.dir ?? 0;
  const shape = active.event.shape;
  const forwardOffset = shape.kind === "line" ? shape.length / 2 : 0;
  const color = active.event.kind === "danger" ? "#ef4444" : "#f59e0b";
  const pulse = 0.45 + 0.5 * progress;
  return (
    <mesh
      position={[x + Math.sin(dir) * forwardOffset, y + 0.06, z + Math.cos(dir) * forwardOffset]}
      rotation={[-Math.PI / 2, 0, shape.kind === "line" || shape.kind === "cone" ? -dir : 0]}
      renderOrder={999}
    >
      <TelegraphGeometry shape={shape} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={pulse}
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
  const [nowMs, setNowMs] = useState(() => performance.now());
  useFrame(() => setNowMs(performance.now()));
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
        <TelegraphDecal key={active.key} active={active} nowMs={nowMs} />
      ))}
    </>
  );
}

export function CombatCameraShake() {
  const ctx = useGameContext();
  const camera = useThree((state) => state.camera);
  const trauma = useRef(0);
  const decay = useRef(4);
  const offset = useRef({ x: 0, y: 0 });
  useEffect(() => {
    return ctx.game.events.on("combat.hitReaction", (event) => {
      if (event.shake === undefined) return;
      trauma.current = Math.min(1, trauma.current + event.shake.amplitude);
      decay.current = event.shake.decay;
    });
  }, [ctx]);
  useFrame((_state, dt) => {
    camera.position.x -= offset.current.x;
    camera.position.y -= offset.current.y;
    if (trauma.current <= 0.0001) {
      offset.current.x = 0;
      offset.current.y = 0;
      return;
    }
    const magnitude = trauma.current * trauma.current;
    offset.current.x = (Math.random() * 2 - 1) * magnitude * 0.4;
    offset.current.y = (Math.random() * 2 - 1) * magnitude * 0.4;
    camera.position.x += offset.current.x;
    camera.position.y += offset.current.y;
    trauma.current = Math.max(0, trauma.current - decay.current * dt);
  });
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
  useEffect(() => {
    return ctx.game.events.on("projectile.settled", (event) => {
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
      window.setTimeout(
        () => setTracers((current) => current.filter((tracer) => tracer.id !== id)),
        lifeMs,
      );
    });
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
