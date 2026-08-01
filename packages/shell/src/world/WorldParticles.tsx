import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactElement } from "react";

import type { GraphicsQuality } from "@jgengine/core/settings/settingsModel";
import { createParticleSystem, type ParticleSystem } from "@jgengine/core/vfx/particles";
import type { ParticleEmitterSpec } from "@jgengine/core/vfx/particleDirector";
import { useGameContext } from "@jgengine/react/provider";

import { ParticleField } from "../vfx/ParticleField";

const QUALITY_POOL_CAP: Record<GraphicsQuality, number> = { low: 128, medium: 256, high: 512 };

/**
 * The per-effect particle pool a graphics tier allows: the requested `max`
 * clamped to the tier cap, so lower tiers degrade density instead of dropping
 * effects entirely.
 */
export function resolveParticleBudget(quality: GraphicsQuality, requested: number | undefined): number {
  const cap = QUALITY_POOL_CAP[quality];
  return Math.max(1, Math.min(requested ?? cap, cap));
}

interface EmitterInstance {
  spec: ParticleEmitterSpec;
  system: ParticleSystem;
  poolMax: number;
}

interface BurstInstance {
  seq: number;
  system: ParticleSystem;
  blending: "additive" | "normal";
}

const MAX_CONCURRENT_BURSTS = 32;

/**
 * Renders `ctx.particles` — the game-reachable particle seam. Standing emitters
 * become persistent `ParticleField`s (recreated only when their pool size changes,
 * retuned in place otherwise), `follow` emitters track their entity's live pose
 * each frame, and drained bursts become transient systems reaped once empty.
 * Auto-mounted by the player shell; pools are capped by graphics quality via
 * {@link resolveParticleBudget}.
 *
 * @internal
 */
export function WorldParticles({ quality }: { quality: GraphicsQuality }): ReactElement {
  const ctx = useGameContext();
  const emittersRef = useRef(new Map<string, EmitterInstance>());
  const burstsRef = useRef<BurstInstance[]>([]);
  const [, setGeneration] = useState(0);

  useEffect(() => {
    const emitters = emittersRef.current;
    function sync(): void {
      let changed = false;
      const specs = ctx.particles.emitters();
      const liveIds = new Set<string>();
      for (const spec of specs) {
        liveIds.add(spec.id);
        const poolMax = resolveParticleBudget(quality, spec.config.max);
        const current = emitters.get(spec.id);
        if (current === undefined || current.poolMax !== poolMax) {
          emitters.set(spec.id, {
            spec,
            poolMax,
            system: createParticleSystem({ ...spec.config, max: poolMax, seed: spec.id }),
          });
          changed = true;
        } else if (current.spec !== spec) {
          current.system.configure({ ...spec.config, max: poolMax });
          current.spec = spec;
        }
      }
      for (const id of emitters.keys()) {
        if (liveIds.has(id)) continue;
        emitters.delete(id);
        changed = true;
      }
      for (const burst of ctx.particles.drainBursts()) {
        const poolMax = resolveParticleBudget(quality, Math.min(burst.count, burst.config.max ?? burst.count));
        const system = createParticleSystem({ ...burst.config, max: poolMax, seed: burst.seq });
        system.emit(burst.count);
        burstsRef.current.push({ seq: burst.seq, system, blending: burst.blending ?? "additive" });
        if (burstsRef.current.length > MAX_CONCURRENT_BURSTS) burstsRef.current.shift();
        changed = true;
      }
      if (changed) setGeneration((n) => n + 1);
    }
    sync();
    const off = ctx.particles.subscribe(sync);
    return () => {
      off();
      emitters.clear();
      burstsRef.current = [];
    };
  }, [ctx, quality]);

  useFrame(() => {
    for (const instance of emittersRef.current.values()) {
      const follow = instance.spec.follow;
      if (follow === undefined) continue;
      const entity = ctx.scene.entity.get(follow);
      if (entity === null || entity === undefined) continue;
      const offset = instance.spec.offset ?? [0, 0, 0];
      instance.system.configure({
        position: [
          entity.position[0] + offset[0],
          entity.position[1] + offset[1],
          entity.position[2] + offset[2],
        ],
      });
    }
    const finished = burstsRef.current.filter((burst) => burst.system.count() === 0);
    if (finished.length > 0) {
      burstsRef.current = burstsRef.current.filter((burst) => burst.system.count() > 0);
      setGeneration((n) => n + 1);
    }
  });

  return (
    <>
      {Array.from(emittersRef.current.values()).map((instance) => (
        <group
          key={instance.spec.id}
          position={
            instance.spec.follow === undefined && instance.spec.offset !== undefined
              ? instance.spec.offset
              : [0, 0, 0]
          }
        >
          <ParticleField system={instance.system} blending={instance.spec.blending ?? "normal"} />
        </group>
      ))}
      {burstsRef.current.map((burst) => (
        <ParticleField key={burst.seq} system={burst.system} blending={burst.blending} />
      ))}
    </>
  );
}
