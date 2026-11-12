/** @jsxImportSource @jgengine/core/ui/jsx */
import * as THREE from "three";
import type { VfxRef } from "@jgengine/core/game/events";
import type { VfxInstanceState, CombatVfxInstanceEvent } from "@jgengine/core/vfx/vfxInstance";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useGameContext } from "@jgengine/ui/provider";
import type { EngineDraw, EngineFrameState } from "@jgengine/core/frame/engineLoop.draw";
import { EngineDrawMount } from "@jgengine/core/frame/useEngineDraw.draw";

/** The renderer's view of a retained instance: its authoritative state plus fade bookkeeping. */
interface LiveEntry {
  state: VfxInstanceState;
  /** Non-null once stopped: fade duration (ms) and the wall-clock time the fade began. */
  fade: { ms: number; startedAt: number } | null;
}

interface Beam {
  entry: LiveEntry;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

const UP = new THREE.Vector3(0, 1, 0);
const from = new THREE.Vector3();
const to = new THREE.Vector3();
const delta = new THREE.Vector3();
const quat = new THREE.Quaternion();

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
 * Draw-side form of the retained beam layer: one draw owns every live beam mesh, reading each
 * instance's authoritative state from the shared map every frame and resolving `from`/`to` refs
 * against the entity store, so an endpoint bound to a moving entity follows it with no per-frame
 * command traffic. `upsert`/`update` mutate the render resources imperatively; only create/stop
 * change the mounted set, and `stop` fades out over its requested duration.
 * @internal
 */
export function retainedVfxDraw(ctx: GameContext): EngineDraw {
  const live = new Map<string, LiveEntry>();
  const beams = new Map<string, Beam>();
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  let unsubscribe: (() => void) | null = null;
  let parent: THREE.Object3D | null = null;

  const dropBeam = (id: string) => {
    const beam = beams.get(id);
    if (beam === undefined) return;
    beams.delete(id);
    beam.mesh.removeFromParent();
    beam.material.dispose();
  };

  const addBeam = (id: string, state: VfxInstanceState) => {
    if (parent === null || beams.has(id)) return;
    const entry: LiveEntry = { state, fade: null };
    live.set(id, entry);
    const material = new THREE.MeshBasicMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 998;
    mesh.visible = false;
    parent.add(mesh);
    beams.set(id, { entry, mesh, material });
  };

  const removeBeam = (id: string) => {
    live.delete(id);
    dropBeam(id);
  };

  const onOp = (op: CombatVfxInstanceEvent) => {
    if (op.op === "stop") {
      const entry = live.get(op.id);
      if (entry === undefined) return;
      if (op.fadeMs !== undefined && op.fadeMs > 0) {
        entry.fade = { ms: op.fadeMs, startedAt: performance.now() };
      } else {
        removeBeam(op.id);
      }
      return;
    }
    const state = op.instance;
    if (state === undefined || state.kind !== "beam") return;
    const existing = live.get(op.id);
    if (existing === undefined) {
      addBeam(op.id, state);
    } else {
      // Update: mutate state in place; the frame reads it next tick (no allocation).
      existing.state = state;
      existing.fade = null;
    }
  };

  return {
    mount(state: EngineFrameState) {
      parent = state.scene;
      for (const instance of ctx.scene.entity.vfxInstance.list()) {
        if (instance.kind === "beam") addBeam(instance.id, instance);
      }
      unsubscribe = ctx.game.events.on("combat.vfxInstance", onOp);
    },
    frame() {
      for (const [id, beam] of beams) {
        const entry = beam.entry;
        const lift = entry.state.params?.["lift"] ?? 1;
        const hasFrom = resolveRef(ctx, entry.state.from, lift, from);
        const hasTo = resolveRef(ctx, entry.state.to, lift, to);
        if (!hasFrom || !hasTo) {
          beam.mesh.visible = false;
          continue;
        }
        delta.subVectors(to, from);
        const length = Math.max(0.001, delta.length());
        beam.mesh.visible = true;
        beam.mesh.position.set(
          (from.x + to.x) / 2,
          (from.y + to.y) / 2,
          (from.z + to.z) / 2,
        );
        quat.setFromUnitVectors(UP, delta.normalize());
        beam.mesh.quaternion.copy(quat);
        const thickness = entry.state.radius ?? 0.12;
        beam.mesh.scale.set(thickness, length, thickness);
        beam.material.color.set(entry.state.color);
        const baseOpacity = entry.state.params?.["opacity"] ?? 0.85;
        if (entry.fade === null) {
          beam.material.opacity = baseOpacity;
        } else {
          const p = (performance.now() - entry.fade.startedAt) / Math.max(1, entry.fade.ms);
          if (p >= 1) {
            removeBeam(id);
            continue;
          }
          beam.material.opacity = baseOpacity * (1 - p);
        }
      }
    },
    dispose() {
      unsubscribe?.();
      unsubscribe = null;
      for (const id of [...beams.keys()]) removeBeam(id);
      live.clear();
      geometry.dispose();
      parent = null;
    },
  };
}

/**
 * Renders retained VFX instances (`combat.vfxInstance` ops from the context's
 * `scene.entity.vfxInstance` store) as long-lived beams whose endpoints follow live entity poses.
 * Auto-mounted by the player shell alongside the one-shot spell overlay. Beam is the first shipped
 * retained renderer; other kinds are ignored here for a future renderer to claim.
 *
 * @internal
 */
export function RetainedVfx() {
  const ctx = useGameContext();
  return <EngineDrawMount create={() => retainedVfxDraw(ctx)} deps={[ctx]} />;
}
