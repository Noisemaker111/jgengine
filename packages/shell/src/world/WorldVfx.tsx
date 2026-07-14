import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CombatVfxEvent, VfxKind } from "@jgengine/core/game/events";
import { useGameContext } from "@jgengine/react/provider";

interface ActiveVfx {
  key: number;
  event: CombatVfxEvent;
}

interface Particle {
  offset: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  size: number;
  delay: number;
}

const PARTICLE_COUNT: Record<VfxKind, number> = {
  projectile: 7,
  beam: 6,
  nova: 14,
  glow: 10,
  spark: 12,
};

function planarDir(): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
}

function sphereDir(): THREE.Vector3 {
  return new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
    .normalize();
}

function makeParticles(kind: VfxKind): Particle[] {
  const count = PARTICLE_COUNT[kind];
  const out: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    if (kind === "nova") {
      out.push({ offset: new THREE.Vector3(), dir: planarDir(), speed: 1, size: 0.5 + Math.random() * 0.4, delay: 0 });
    } else if (kind === "spark") {
      const dir = sphereDir();
      dir.y = Math.abs(dir.y) * 0.6 + 0.2;
      out.push({ offset: new THREE.Vector3(), dir, speed: 2.4 + Math.random() * 1.8, size: 0.28 + Math.random() * 0.22, delay: 0 });
    } else if (kind === "glow") {
      out.push({
        offset: planarDir().multiplyScalar(0.35 + Math.random() * 0.5),
        dir: new THREE.Vector3(0, 1, 0),
        speed: 0.5 + Math.random() * 0.6,
        size: 0.55 + Math.random() * 0.5,
        delay: Math.random() * 0.3,
      });
    } else if (kind === "beam") {
      out.push({ offset: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 0, size: 0.45 + Math.random() * 0.3, delay: 0 });
    } else {
      out.push({
        offset: sphereDir().multiplyScalar(0.12),
        dir: new THREE.Vector3(),
        speed: 0,
        size: 0.4 + Math.random() * 0.25,
        delay: i * 0.05,
      });
    }
  }
  return out;
}

function useRadialTexture(): THREE.Texture {
  return useMemo(() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext("2d");
    if (c !== null) {
      const gradient = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.35, "rgba(255,255,255,0.65)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = gradient;
      c.fillRect(0, 0, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function VfxItem({ event, texture }: { event: CombatVfxEvent; texture: THREE.Texture }) {
  const born = useRef(performance.now());
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const beamMat = useRef<THREE.MeshBasicMaterial>(null);
  const color = useMemo(() => new THREE.Color(event.color), [event.color]);
  const from = useMemo(() => new THREE.Vector3(event.from[0], event.from[1] + 1, event.from[2]), [event.from]);
  const to = useMemo(
    () => (event.to === undefined ? from.clone() : new THREE.Vector3(event.to[0], event.to[1] + 1, event.to[2])),
    [event.to, from],
  );
  const radius = event.radius ?? 2.5;
  const beam = useMemo(() => {
    const delta = new THREE.Vector3().subVectors(to, from);
    const length = Math.max(0.001, delta.length());
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.clone().normalize(),
    );
    return { length, mid, quat };
  }, [from, to]);
  const particles = useMemo(() => makeParticles(event.kind), [event.kind]);
  const scratch = useRef(new THREE.Vector3());

  useFrame(() => {
    const p = clamp01((performance.now() - born.current) / event.durationMs);
    const kind = event.kind;
    for (let i = 0; i < particles.length; i += 1) {
      const sprite = sprites.current[i];
      const particle = particles[i];
      if (sprite === undefined || sprite === null || particle === undefined) continue;
      const pos = scratch.current;
      let opacity = 0;
      let scale = particle.size;
      if (kind === "projectile") {
        const travel = clamp01(p * 1.15 - particle.delay);
        pos.copy(from).lerp(to, travel).add(particle.offset);
        opacity = (1 - p) * (i === 0 ? 1 : 0.55);
        scale = particle.size * (i === 0 ? 1 : 0.7);
      } else if (kind === "beam") {
        pos.copy(from).lerp(to, i / Math.max(1, particles.length - 1));
        opacity = (1 - p) * 0.8;
      } else if (kind === "nova") {
        pos.set(event.from[0], event.from[1] + 0.4, event.from[2]).addScaledVector(particle.dir, radius * p);
        opacity = (1 - p) * 0.9;
      } else if (kind === "glow") {
        const local = clamp01(p - particle.delay);
        pos.copy(from).add(particle.offset).addScaledVector(particle.dir, particle.speed * local);
        opacity = Math.sin(clamp01(p) * Math.PI) * 0.9;
        scale = particle.size * (0.8 + 0.3 * Math.sin(local * Math.PI));
      } else {
        pos.copy(to).addScaledVector(particle.dir, particle.speed * p);
        pos.y -= p * p * 1.4;
        opacity = (1 - p) * 0.95;
      }
      sprite.position.copy(pos);
      sprite.scale.set(scale, scale, 1);
      const material = sprite.material as THREE.SpriteMaterial;
      material.opacity = opacity;
    }
    if (ringRef.current !== null && ringMat.current !== null) {
      const s = Math.max(0.001, radius * p);
      ringRef.current.scale.set(s, s, s);
      ringMat.current.opacity = (1 - p) * 0.7;
    }
    if (beamMat.current !== null) {
      beamMat.current.opacity = (1 - p) * 0.85;
    }
  });

  return (
    <group>
      {particles.map((_, i) => (
        <sprite
          key={i}
          ref={(node) => {
            sprites.current[i] = node;
          }}
        >
          <spriteMaterial
            map={texture}
            color={color}
            transparent
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            opacity={0}
          />
        </sprite>
      ))}
      {event.kind === "nova" && (
        <mesh
          ref={ringRef}
          position={[event.from[0], event.from[1] + 0.06, event.from[2]]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={998}
        >
          <ringGeometry args={[0.82, 1, 48]} />
          <meshBasicMaterial
            ref={ringMat}
            color={color}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
            depthTest={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            opacity={0}
          />
        </mesh>
      )}
      {event.kind === "beam" && (
        <mesh
          position={[beam.mid.x, beam.mid.y, beam.mid.z]}
          quaternion={[beam.quat.x, beam.quat.y, beam.quat.z, beam.quat.w]}
          renderOrder={998}
        >
          <cylinderGeometry args={[0.12, 0.12, beam.length, 8, 1, true]} />
          <meshBasicMaterial
            ref={beamMat}
            color={color}
            transparent
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
            opacity={0}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Renders `combat.vfx` bursts as additive sprite-particle effects in the world scene. Auto-mounted by the
 * player shell alongside the other world overlays; games emit effects via `ctx.scene.entity.vfx(...)`.
 *
 * @internal
 */
export function WorldSpellVfx({ tailMs = 200 }: { tailMs?: number }) {
  const ctx = useGameContext();
  const texture = useRadialTexture();
  const [active, setActive] = useState<ActiveVfx[]>([]);
  const key = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    const off = ctx.game.events.on("combat.vfx", (event) => {
      const entry: ActiveVfx = { key: key.current++, event };
      setActive((current) => [...current, entry]);
      const timer = setTimeout(() => {
        pending.delete(timer);
        setActive((current) => current.filter((item) => item.key !== entry.key));
      }, event.durationMs + tailMs);
      pending.add(timer);
    });
    return () => {
      off();
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, [ctx, tailMs]);
  return (
    <>
      {active.map((item) => (
        <VfxItem key={item.key} event={item.event} texture={texture} />
      ))}
    </>
  );
}
