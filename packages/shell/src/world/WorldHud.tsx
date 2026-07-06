import { Html, Line } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { SceneEntity } from "@jgengine/core/scene/entityStore";
import { useGameContext } from "@jgengine/react/provider";
import { useEntityStat, useSceneEntities } from "@jgengine/react/hooks";

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

export function WorldEntityBars({ statId, height = 2.2 }: { statId: string; height?: number }) {
  const ctx = useGameContext();
  const entities = useSceneEntities();
  const playerId = ctx.player.userId;
  return (
    <>
      {entities.map((entity) =>
        entity.id === playerId ? null : (
          <EntityBar key={entity.id} entity={entity} statId={statId} height={height} />
        ),
      )}
    </>
  );
}

interface Floater {
  id: number;
  position: [number, number, number];
  text: string;
  kind: string;
}

function FloatTextItem({ text, kind, lifeMs }: { text: string; kind: string; lifeMs: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <span
      className={kind === "heal" ? "text-emerald-300" : "text-amber-200"}
      style={{
        display: "inline-block",
        fontWeight: 800,
        fontSize: "18px",
        textShadow: "0 1px 3px rgba(0,0,0,0.95)",
        transition: `transform ${lifeMs}ms ease-out, opacity ${lifeMs}ms ease-out`,
        transform: shown ? "translateY(-30px)" : "translateY(0)",
        opacity: shown ? 0 : 1,
      }}
    >
      {text}
    </span>
  );
}

export function WorldFloatText({ height = 1.9, lifeMs = 950 }: { height?: number; lifeMs?: number }) {
  const ctx = useGameContext();
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextId = useRef(0);
  useEffect(() => {
    return ctx.game.events.on("entity.floatText", (event) => {
      const id = nextId.current++;
      setFloaters((current) => [
        ...current,
        { id, position: event.position, text: event.text, kind: event.kind },
      ]);
      window.setTimeout(
        () => setFloaters((current) => current.filter((floater) => floater.id !== id)),
        lifeMs,
      );
    });
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
          <FloatTextItem text={floater.text} kind={floater.kind} lifeMs={lifeMs} />
        </Html>
      ))}
    </>
  );
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
