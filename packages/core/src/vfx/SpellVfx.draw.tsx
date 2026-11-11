/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";
import type { CombatVfxEvent, VfxKind } from "@jgengine/core/game/events";
import { useGameContext } from "@jgengine/react/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { useEngineDraw } from "@jgengine/core/frame/useEngineDraw.draw";
import { clamp01 } from "../math/scalar";

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
  arc: 16,
};

/** Half the sweep of a melee arc, in radians (about 130 degrees end to end). */
const ARC_HALF_SWEEP = 1.15;

/**
 * Where point `t` (0..1, one blade edge to the other) of a melee swing arc sits: a curve of radius
 * `reach` in front of the attacker at `from`, centred on the direction to `to` and tilted so the
 * swing runs high to low, never a burst at the body centre. Writes into `out`.
 * @internal
 */
export function slashArcPoint(
  from: THREE.Vector3,
  to: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const fx = length < 1e-4 ? 0 : dx / length;
  const fz = length < 1e-4 ? 1 : dz / length;
  const reach = length < 1e-4 ? 1 : Math.min(1.2, Math.max(0.7, length * 0.6));
  const angle = (t - 0.5) * 2 * ARC_HALF_SWEEP;
  const forward = Math.cos(angle) * reach;
  const side = Math.sin(angle) * reach;
  return out.set(from.x + fx * forward - fz * side, from.y + 0.25 - (t - 0.5) * 0.7, from.z + fz * forward + fx * side);
}

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
    } else if (kind === "arc") {
      out.push({ offset: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 0, size: 0.34, delay: i / Math.max(1, count - 1) });
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

function radialTexture(): THREE.Texture {
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
}

/** One combat.vfx burst: sprites plus an optional nova ring or beam mesh, animated by wall clock. */
function vfxItemDraw(event: CombatVfxEvent, texture: THREE.Texture): EngineDraw {
  const born = performance.now();
  const group = new THREE.Group();
  const color = new THREE.Color(event.color);
  const from = new THREE.Vector3(event.from[0], event.from[1] + 1, event.from[2]);
  const to = event.to === undefined ? from.clone() : new THREE.Vector3(event.to[0], event.to[1] + 1, event.to[2]);
  const radius = event.radius ?? 2.5;
  const beamDelta = new THREE.Vector3().subVectors(to, from);
  const beamLength = Math.max(0.001, beamDelta.length());
  const beamMid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const beamQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDelta.clone().normalize());
  const particles = makeParticles(event.kind);
  const sprites: THREE.Sprite[] = [];
  const materials: THREE.Material[] = [];
  const scratch = new THREE.Vector3();

  for (let i = 0; i < particles.length; i += 1) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    materials.push(material);
    sprites.push(sprite);
    group.add(sprite);
  }

  let ring: THREE.Mesh | null = null;
  let ringMat: THREE.MeshBasicMaterial | null = null;
  let ringGeometry: THREE.RingGeometry | null = null;
  if (event.kind === "nova") {
    ringGeometry = new THREE.RingGeometry(0.82, 1, 48);
    ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0,
    });
    ring = new THREE.Mesh(ringGeometry, ringMat);
    ring.position.set(event.from[0], event.from[1] + 0.06, event.from[2]);
    ring.rotation.set(-Math.PI / 2, 0, 0);
    ring.renderOrder = 998;
    materials.push(ringMat);
    group.add(ring);
  }

  let beamMat: THREE.MeshBasicMaterial | null = null;
  let beamGeometry: THREE.CylinderGeometry | null = null;
  if (event.kind === "beam") {
    beamGeometry = new THREE.CylinderGeometry(0.12, 0.12, beamLength, 8, 1, true);
    beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0,
    });
    const beamMesh = new THREE.Mesh(beamGeometry, beamMat);
    beamMesh.position.copy(beamMid);
    beamMesh.quaternion.copy(beamQuat);
    beamMesh.renderOrder = 998;
    materials.push(beamMat);
    group.add(beamMesh);
  }

  return {
    mount(state: EngineFrameState) {
      state.scene.add(group);
    },
    frame() {
      const p = clamp01((performance.now() - born) / event.durationMs);
      const kind = event.kind;
      for (let i = 0; i < particles.length; i += 1) {
        const sprite = sprites[i];
        const particle = particles[i];
        if (sprite === undefined || particle === undefined) continue;
        const pos = scratch;
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
        } else if (kind === "arc") {
          // The blade sweeps edge to edge in the first 60% of the life, then the trail fades.
          const t = particle.delay;
          slashArcPoint(from, to, t, pos);
          const head = p / 0.6;
          opacity = t <= head ? (1 - p) * (0.35 + 0.65 * t) : 0;
          scale = particle.size * (0.55 + 0.75 * Math.sin(Math.PI * t));
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
        (sprite.material as THREE.SpriteMaterial).opacity = opacity;
      }
      if (ring !== null && ringMat !== null) {
        const s = Math.max(0.001, radius * p);
        ring.scale.set(s, s, s);
        ringMat.opacity = (1 - p) * 0.7;
      }
      if (beamMat !== null) {
        beamMat.opacity = (1 - p) * 0.85;
      }
    },
    dispose(state: EngineFrameState) {
      state.scene.remove(group);
      group.clear();
      for (const material of materials) material.dispose();
      ringGeometry?.dispose();
      beamGeometry?.dispose();
    },
  };
}

/**
 * Renders `combat.vfx` bursts as additive sprite-particle effects in the world scene.
 * @internal
 */
export function spellVfxDraw(ctx: GameContext, { tailMs = 200 }: { tailMs?: number }): EngineDraw {
  const active = new Map<number, { draw: EngineDraw; timer: ReturnType<typeof setTimeout> }>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let key = 0;
  let texture: THREE.Texture | null = null;
  let state: EngineFrameState | null = null;
  let off: (() => void) | null = null;

  function remove(key_: number): void {
    const item = active.get(key_);
    if (item === undefined || state === null) return;
    clearTimeout(item.timer);
    timers.delete(item.timer);
    item.draw.dispose?.(state);
    active.delete(key_);
  }

  return {
    mount(mountState: EngineFrameState) {
      state = mountState;
      texture = radialTexture();
      off = ctx.game.events.on("combat.vfx", (event: CombatVfxEvent) => {
        const entryKey = key++;
        const draw = vfxItemDraw(event, texture as THREE.Texture);
        draw.mount?.(mountState);
        const timer = setTimeout(() => remove(entryKey), event.durationMs + tailMs);
        timers.add(timer);
        active.set(entryKey, { draw, timer });
      });
    },
    frame(frameState: EngineFrameState) {
      for (const item of active.values()) item.draw.frame?.(frameState, frameState.delta);
    },
    dispose() {
      off?.();
      off = null;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      if (state !== null) {
        for (const item of active.values()) item.draw.dispose?.(state);
      }
      active.clear();
      texture?.dispose();
      texture = null;
      state = null;
    },
  };
}

/** Renders `combat.vfx` bursts as additive sprite-particle effects in the world scene. @internal */
export function SpellVfx({ tailMs = 200 }: { tailMs?: number }) {
  const ctx = useGameContext();
  useEngineDraw(() => spellVfxDraw(ctx, { tailMs }), [ctx, tailMs]);
  return <></>;
}
