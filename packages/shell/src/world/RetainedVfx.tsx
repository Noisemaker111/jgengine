import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { VfxRef } from "@jgengine/core/game/events";
import type { VfxInstanceState } from "@jgengine/core/game/vfxInstance";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/react/provider";

/** The renderer's view of a retained instance: its authoritative state plus fade bookkeeping. */
interface LiveEntry {
  state: VfxInstanceState;
  /** Non-null once stopped: fade duration (ms) and the wall-clock time the fade began. */
  fade: { ms: number; startedAt: number } | null;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Resolve an endpoint into `out`. A world point is used literally; an entity id resolves to its live pose lifted
 * by `lift` (so a beam meets an entity near chest height, not its feet). Returns false when an entity ref is
 * missing, letting the caller hide the effect until the target exists again.
 */
function resolveRef(ctx: GameContext, ref: VfxRef | undefined, lift: number, out: THREE.Vector3): boolean {
  if (ref === undefined) return false;
  if (typeof ref === "string") {
    const entity = ctx.scene.entity.get(ref);
    if (entity === null) return false;
    out.set(entity.position[0], entity.position[1] + lift, entity.position[2]);
    return true;
  }
  out.set(ref[0], ref[1], ref[2]);
  return true;
}

/**
 * One retained beam mesh. It reads its authoritative state from the shared live map every frame and resolves
 * `from`/`to` refs against the entity store, so an endpoint bound to a moving entity follows it with no per-frame
 * command traffic or React re-render — parameter updates mutate the render resources imperatively.
 */
function RetainedBeam({
  id,
  live,
  onFadeComplete,
}: {
  id: string;
  live: Map<string, LiveEntry>;
  onFadeComplete: (id: string) => void;
}) {
  const ctx = useGameContext();
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const from = useRef(new THREE.Vector3());
  const to = useRef(new THREE.Vector3());
  const delta = useRef(new THREE.Vector3());
  const quat = useRef(new THREE.Quaternion());

  useFrame(() => {
    const entry = live.get(id);
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (entry === undefined || mesh === null || mat === null) return;
    const lift = entry.state.params?.lift ?? 1;
    const hasFrom = resolveRef(ctx, entry.state.from, lift, from.current);
    const hasTo = resolveRef(ctx, entry.state.to, lift, to.current);
    if (!hasFrom || !hasTo) {
      mesh.visible = false;
      return;
    }
    delta.current.subVectors(to.current, from.current);
    const length = Math.max(0.001, delta.current.length());
    mesh.visible = true;
    mesh.position.set(
      (from.current.x + to.current.x) / 2,
      (from.current.y + to.current.y) / 2,
      (from.current.z + to.current.z) / 2,
    );
    quat.current.setFromUnitVectors(UP, delta.current.normalize());
    mesh.quaternion.copy(quat.current);
    const thickness = entry.state.radius ?? 0.12;
    mesh.scale.set(thickness, length, thickness);
    mat.color.set(entry.state.color);
    const baseOpacity = entry.state.params?.opacity ?? 0.85;
    if (entry.fade === null) {
      mat.opacity = baseOpacity;
    } else {
      const p = (performance.now() - entry.fade.startedAt) / Math.max(1, entry.fade.ms);
      if (p >= 1) {
        onFadeComplete(id);
        return;
      }
      mat.opacity = baseOpacity * (1 - p);
    }
  });

  return (
    <mesh ref={meshRef} renderOrder={998} visible={false}>
      <cylinderGeometry args={[1, 1, 1, 8, 1, true]} />
      <meshBasicMaterial
        ref={matRef}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        opacity={0}
      />
    </mesh>
  );
}

/**
 * Renders retained VFX instances (`combat.vfxInstance` ops from {@link GameContext}'s `scene.entity.vfxInstance`
 * store) as long-lived beams whose endpoints follow live entity poses. Auto-mounted by the player shell alongside
 * the one-shot {@link WorldSpellVfx} overlay. `upsert`/`update` mutate render resources imperatively (no per-frame
 * React allocation); only create/stop change the mounted set, and `stop` fades out over its requested duration.
 * Beam is the first shipped retained renderer; other kinds are ignored here for a future renderer to claim.
 *
 * @internal
 */
export function RetainedVfx() {
  const ctx = useGameContext();
  const live = useRef(new Map<string, LiveEntry>()).current;
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    // Seed from any instances created before this overlay mounted.
    for (const state of ctx.scene.entity.vfxInstance.list()) {
      if (state.kind !== "beam") continue;
      live.set(state.id, { state, fade: null });
    }
    if (live.size > 0) setIds([...live.keys()]);

    const off = ctx.game.events.on("combat.vfxInstance", (op) => {
      if (op.op === "stop") {
        const entry = live.get(op.id);
        if (entry === undefined) return;
        if (op.fadeMs !== undefined && op.fadeMs > 0) {
          entry.fade = { ms: op.fadeMs, startedAt: performance.now() };
        } else {
          live.delete(op.id);
          setIds([...live.keys()]);
        }
        return;
      }
      const state = op.instance;
      if (state === undefined || state.kind !== "beam") return;
      const existing = live.get(op.id);
      if (existing === undefined) {
        live.set(op.id, { state, fade: null });
        setIds([...live.keys()]);
      } else {
        // Update: mutate state in place; RetainedBeam reads it next frame (no React re-render).
        existing.state = state;
        existing.fade = null;
      }
    });
    return () => {
      off();
      live.clear();
      setIds([]);
    };
  }, [ctx, live]);

  function removeId(id: string): void {
    live.delete(id);
    setIds((current) => current.filter((entry) => entry !== id));
  }

  return (
    <>
      {ids.map((id) => (
        <RetainedBeam key={id} id={id} live={live} onFadeComplete={removeId} />
      ))}
    </>
  );
}
