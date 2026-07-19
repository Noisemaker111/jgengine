import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";

import type { ModelConfig, ModelPart } from "@jgengine/core/game/playableGame";
import {
  createPartPose,
  partMotionPhase,
  sampleBodyPose,
  samplePartPose,
  type PartMotionInput,
} from "@jgengine/core/game/partAnimation";
import { useGameContext } from "@jgengine/react/provider";

const FLINCH_RELEASE_SEC = 0.35;
const DEATH_RAMP_PER_SEC = 2.5;
const SPEED_SMOOTHING = 12;

/**
 * Procedural motion rig for a rig-less part-composed character (`ModelPart.role` — see
 * `@jgengine/core/game/partAnimation`). Wraps the whole composition in a root group that bobs,
 * breathes, flinches on `combat.hitReaction`, and topples on `entity.died`, while each
 * role-tagged part swings around its authored transform — legs/arms counter-phase from the
 * entity's live movement speed, head counter-sway, tail wag, wing flap. Untagged parts render
 * as static kit pieces. Children are the base model content (primitive, attachments).
 */
export function PartMotionRig({
  parts,
  model,
  instanceId,
  renderPart,
  children,
}: {
  parts: readonly ModelPart[];
  model: ModelConfig;
  instanceId?: string;
  /** Renders one part's model content (the shell passes its part renderer to avoid an import cycle). */
  renderPart: (part: ModelPart, index: number) => ReactNode;
  children: ReactNode;
}): ReactNode {
  const ctx = useGameContext();
  const rootRef = useRef<THREE.Group>(null);
  const partRefs = useRef<(THREE.Group | null)[]>([]);
  const motionRef = useRef({
    lastPos: null as [number, number, number] | null,
    speed: 0,
    flinch: 0,
    death: 0,
  });
  const phase = useMemo(() => partMotionPhase(instanceId ?? model.url), [instanceId, model.url]);

  useEffect(() => {
    if (instanceId === undefined) return;
    const offHit = ctx.game.events.on("combat.hitReaction", (event) => {
      if (event.instanceId === instanceId) motionRef.current.flinch = 1;
    });
    const offDied = ctx.game.events.on("entity.died", (event) => {
      if (event.instanceId === instanceId) motionRef.current.death = Math.max(motionRef.current.death, 1e-6);
    });
    return () => {
      offHit();
      offDied();
    };
  }, [ctx, instanceId]);

  const input: PartMotionInput = useMemo(
    () => ({ timeSec: 0, speed: 0, phase, flinch: 0, death: 0 }),
    [phase],
  );
  const pose = useMemo(() => createPartPose(), []);

  useFrame((frameState, delta) => {
    const motion = motionRef.current;
    if (delta > 0 && instanceId !== undefined) {
      const entity = ctx.scene.entity.get(instanceId);
      if (entity !== null) {
        const [x, , z] = entity.position;
        if (motion.lastPos !== null) {
          const instantSpeed = Math.hypot(x - motion.lastPos[0], z - motion.lastPos[2]) / delta;
          motion.speed += (instantSpeed - motion.speed) * Math.min(1, delta * SPEED_SMOOTHING);
        }
        motion.lastPos = [x, entity.position[1], z];
      }
      motion.flinch = Math.max(0, motion.flinch - delta / FLINCH_RELEASE_SEC);
      if (motion.death > 0) motion.death = Math.min(1, motion.death + delta * DEATH_RAMP_PER_SEC);
    }

    input.timeSec = frameState.clock.elapsedTime;
    input.speed = motion.speed;
    input.flinch = motion.flinch;
    input.death = motion.death;

    const root = rootRef.current;
    if (root !== null) {
      sampleBodyPose(input, model.partMotion, pose);
      root.position.set(pose.position[0], pose.position[1], pose.position[2]);
      root.rotation.set(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
    }
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!;
      const group = partRefs.current[index];
      if (group === null || group === undefined || part.role === undefined) continue;
      samplePartPose(part.role, input, model.partMotion, pose);
      const base = part.position ?? [0, 0, 0];
      const baseRotation = part.rotation ?? [0, 0, 0];
      group.position.set(base[0] + pose.position[0], base[1] + pose.position[1], base[2] + pose.position[2]);
      group.rotation.set(
        baseRotation[0] + pose.rotation[0],
        baseRotation[1] + pose.rotation[1],
        baseRotation[2] + pose.rotation[2],
      );
    }
  });

  return (
    <group ref={rootRef}>
      {children}
      {parts.map((part, index) => (
        <group
          key={index}
          ref={(group) => {
            partRefs.current[index] = group;
          }}
          position={part.position ?? [0, 0, 0]}
          rotation={part.rotation ?? [0, 0, 0]}
          scale={part.scale ?? 1}
        >
          {renderPart(part, index)}
        </group>
      ))}
    </group>
  );
}
