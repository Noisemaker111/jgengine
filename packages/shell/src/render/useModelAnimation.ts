import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { ModelAnimationConfig } from "@jgengine/core/game/playableGame";
import { resolveAnimationConfig } from "@jgengine/core/game/clipRoles";
import {
  ANIM_PARAMS_KEY,
  createAnimGraphRuntime,
  type AnimClipOutput,
  type AnimGraph,
  type AnimGraphRuntime,
  type AnimParamValue,
} from "@jgengine/core/anim/animGraph";
import { animGraphFromConfig, LOCOMOTION_CROUCHED_PARAM, LOCOMOTION_GROUNDED_PARAM, LOCOMOTION_SPEED_PARAM, LOCOMOTION_VERTICAL_SPEED_PARAM } from "@jgengine/core/anim/locomotionGraph";
import { playerMovementTelemetry } from "@jgengine/core/movement/playerMovement";
import { seededRng } from "@jgengine/core/random/rng";
import type { GameContext } from "@jgengine/core/runtime/gameContextTypes";
import { useOptionalGameContext } from "@jgengine/react/provider";

function graphClipNames(graph: AnimGraph): Set<string> {
  const names = new Set<string>();
  for (const layer of graph.layers) {
    for (const state of Object.values(layer.states)) {
      if (state.kind === "clip") {
        names.add(state.clip);
        for (const variant of state.variants ?? []) names.add(variant);
      }
      else for (const point of state.points) names.add(point.clip);
    }
  }
  return names;
}

/** A repairable mismatch between a model animation config and its imported rig. */
export interface ModelAnimationDiagnostic {
  code: "missing-clip" | "missing-root-track" | "empty-layer-mask" | "incomplete-locomotion";
  message: string;
}

/**
 * Checks clip mappings, masked layers and root-motion assumptions without starting a mixer.
 *
 * @capability model-animation-diagnostics inspect imported clip mappings, layer masks and root-track compatibility
 */
export function diagnoseModelAnimation(
  scene: THREE.Object3D,
  animation: ModelAnimationConfig,
  clips: readonly THREE.AnimationClip[],
): readonly ModelAnimationDiagnostic[] {
  const diagnostics: ModelAnimationDiagnostic[] = [];
  const available = new Set(clips.map((clip) => clip.name));
  const missing = new Set<string>();
  const resolved = animGraphFromConfig(animation);
  const { states } = animation;
  if (animation.graph === undefined && states !== undefined) {
    if (typeof states.idle !== "string" || states.idle.trim().length === 0) diagnostics.push({
      code: "incomplete-locomotion", message: `locomotion needs a nonempty idle clip. Configure this rig's idle role; ${animation.clip === undefined ? "the bind pose is retained" : `single clip "${animation.clip}" remains active`} until then.`,
    });
    else if (typeof states.walk !== "string" || states.walk.trim().length === 0) diagnostics.push({
      code: "incomplete-locomotion", message: `locomotion has no walk clip; idle "${states.idle}" is held at walking speeds until this rig's walk role is configured.`,
    });
  }
  if (resolved !== undefined) {
    for (const name of graphClipNames(resolved)) if (!available.has(name)) missing.add(name);
  } else if (animation.clip !== undefined && !available.has(animation.clip)) missing.add(animation.clip);
  if (missing.size > 0) diagnostics.push({ code: "missing-clip", message:
    `clip(s) ${[...missing].map((name) => `"${name}"`).join(", ")} ` +
      `not found on this rig. Available: ${clips.map((clip) => clip.name).join(", ")}. ` +
      `Missing clips contribute no pose; an invalid single-clip config retains the bind pose. Set animation: "auto" to ` +
      `derive states/one-shots from the rig's own clip names.`,
  });
  if (resolved !== undefined) {
    let root: THREE.Object3D | undefined;
    scene.traverse((node) => { if (root === undefined && (node as THREE.Bone).isBone === true) root = node; });
    const rootTrackName = root === undefined ? undefined : `${root.name}.position`;
    for (const layer of resolved.layers) {
      const layerNames = graphClipNames({ layers: [layer] });
      if (layer.mask !== undefined && !clips.some((clip) => layerNames.has(clip.name) && clip.tracks.some((track) => layer.mask!.some((prefix) => track.name.startsWith(prefix))))) {
        diagnostics.push({ code: "empty-layer-mask", message: `layer "${layer.id}" mask matches no imported animation tracks. Use this rig's bone-name prefixes.` });
      }
      for (const [id, state] of Object.entries(layer.states)) {
        if (state.rootMotion !== true) continue;
        const names = state.kind === "clip" ? state.variants ?? [state.clip] : state.points.map((point) => point.clip);
        const missingTracks = names.filter((name) => {
          const clip = clips.find((candidate) => candidate.name === name);
          return clip !== undefined && (rootTrackName === undefined || !clip.tracks.some((track) => track.name === rootTrackName && (layer.mask === undefined || layer.mask.some((prefix) => track.name.startsWith(prefix)))));
        });
        if (missingTracks.length > 0) diagnostics.push({ code: "missing-root-track", message:
          `root-motion state "${layer.id}/${id}" has no assigned position track for ${root === undefined ? "a root bone" : `first bone "${root.name}"`} in ${missingTracks.join(", ")}. ` +
          `Root travel cannot be extracted; use an in-place state or supply a supported root-bone track.`,
        });
      }
    }
  }
  return diagnostics;
}

function warnAnimationDiagnostics(scene: THREE.Object3D, animation: ModelAnimationConfig, clips: readonly THREE.AnimationClip[]): void {
  if (typeof console === "undefined") return;
  for (const diagnostic of diagnoseModelAnimation(scene, animation, clips)) console.warn(`[jgengine] model animation: ${diagnostic.message}`);
}

interface GraphPlayback {
  runtime: AnimGraphRuntime;
  actions: Map<string, THREE.AnimationAction>;
  durations: Record<string, { duration: number; rootTrack?: { times: Float32Array; values: Float32Array } }>;
  rootBone: THREE.Bone | null;
  rootBindPosition: THREE.Vector3 | null;
  lastPos: [number, number, number] | null;
  smoothedSpeed: number;
  params: Record<string, AnimParamValue>;
}

/**
 * Refreshes a caller-owned graph parameter dictionary from authored extras and known physical movement.
 * Grounded, verticalSpeed and crouched use the shared motor's resolved state when available; custom movers
 * retain their authored values. Speed always uses the supplied measured ground speed. Does not write game state.
 *
 * @capability animation-motion-params read resolved player movement into reusable animation graph parameters
 */
export function readModelAnimationParams(
  ctx: GameContext,
  instanceId: string,
  speed: number,
  out: Record<string, AnimParamValue>,
): Record<string, AnimParamValue> {
  const extra = ctx.scene.entity.blackboard.get<Record<string, AnimParamValue>>(instanceId, ANIM_PARAMS_KEY);
  const motion = playerMovementTelemetry(ctx, instanceId);
  if (out === extra || out === motion) throw new Error("readModelAnimationParams requires a caller-owned output dictionary distinct from the entity blackboard and movement telemetry");
  for (const key in out) if (Object.hasOwn(out, key)) delete out[key];
  if (extra !== undefined) Object.assign(out, extra);
  if (motion !== null) {
    out[LOCOMOTION_GROUNDED_PARAM] = motion.grounded;
    out[LOCOMOTION_VERTICAL_SPEED_PARAM] = motion.verticalVelocity;
    out[LOCOMOTION_CROUCHED_PARAM] = motion.crouching;
  }
  out[LOCOMOTION_SPEED_PARAM] = speed;
  return out;
}

/** Per-layer action key: a masked or additive layer needs its own clip variant even for a clip another layer plays. */
function actionKey(layer: string, clip: string): string {
  return `${layer}:${clip}`;
}

const rootBasis = new THREE.Matrix3();

/**
 * For a frame where a `rootMotion` state is current: pins the root bone's horizontal translation to
 * its bind pose, so the clip plays in place, and returns that step's root travel as a world-space
 * horizontal delta (through the rig's parent transform, so the entity's facing and the model's
 * scale apply). The root bone's vertical motion stays in the clip.
 */
export function takeRootMotion(
  rootBone: THREE.Object3D,
  bind: THREE.Vector3,
  localDelta: readonly [number, number, number] | undefined,
  out: THREE.Vector3,
): THREE.Vector3 {
  rootBone.position.x = bind.x;
  rootBone.position.z = bind.z;
  out.set(0, 0, 0);
  if (localDelta === undefined || rootBone.parent === null) return out;
  rootBone.parent.updateWorldMatrix(true, false);
  out.set(localDelta[0], localDelta[1], localDelta[2]).applyMatrix3(rootBasis.setFromMatrix4(rootBone.parent.matrixWorld));
  out.y = 0;
  return out;
}

function applyGraphClips(actions: ReadonlyMap<string, THREE.AnimationAction>, clips: readonly AnimClipOutput[]): void {
  for (const action of actions.values()) action.weight = 0;
  for (const entry of clips) {
    const action = actions.get(actionKey(entry.layer, entry.clip));
    if (action === undefined) continue;
    action.weight += entry.weight;
    action.time = entry.time;
  }
}

/** A mixer set up to show {@link AnimGraph} output on a rig; see {@link createGraphPose}. */
export interface GraphPose {
  /** Clip durations read from the rig, the `clips` argument `runtime.advance` expects. */
  durations: Readonly<Record<string, { duration: number; rootTrack?: { times: Float32Array; values: Float32Array } }>>;
  /** Poses the rig with one advance's clip weights and times. */
  apply(clips: readonly AnimClipOutput[], rootMotion?: boolean): void;
  dispose(): void;
}

/**
 * Binds a graph's clips to a rig exactly as `useModelAnimation` does (masked layers get filtered
 * clips, additive layers additive ones) so a host that runs its own `createAnimGraphRuntime`, such as
 * the editor's graph preview, poses the rig from the runtime's output.
 */
export function createGraphPose(scene: THREE.Object3D, graph: AnimGraph, clips: THREE.AnimationClip[]): GraphPose {
  warnAnimationDiagnostics(scene, { graph }, clips);
  const mixer = new THREE.AnimationMixer(scene);
  const playback = buildGraphPlayback(scene, mixer, graph, clips);
  return {
    durations: playback.durations,
    apply(output, rootMotion = false) {
      applyGraphClips(playback.actions, output);
      mixer.update(0);
      if (rootMotion && playback.rootBone !== null && playback.rootBindPosition !== null) {
        playback.rootBone.position.x = playback.rootBindPosition.x;
        playback.rootBone.position.z = playback.rootBindPosition.z;
      }
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    },
  };
}

function buildGraphPlayback(scene: THREE.Object3D, mixer: THREE.AnimationMixer, graph: AnimGraph, clips: THREE.AnimationClip[], rng?: () => number): GraphPlayback {
  const actions = new Map<string, THREE.AnimationAction>();
  const durations: GraphPlayback["durations"] = {};
  let resolvedRootBone: THREE.Bone | null = null;
  scene.traverse((object: THREE.Object3D) => {
    if (resolvedRootBone === null && object instanceof THREE.Bone) resolvedRootBone = object;
  });
  const rootBone = resolvedRootBone as THREE.Bone | null;
  for (const clip of clips) {
    const track = rootBone === null ? undefined : clip.tracks.find((candidate) => candidate.name === `${rootBone.name}.position`);
    durations[clip.name] = {
      duration: clip.duration,
      ...(track === undefined ? {} : { rootTrack: { times: new Float32Array(track.times), values: new Float32Array(track.values) } }),
    };
  }
  for (const layer of graph.layers) {
    const names = new Set<string>();
    for (const state of Object.values(layer.states)) {
      if (state.kind === "clip") {
        names.add(state.clip);
        for (const variant of state.variants ?? []) names.add(variant);
      }
      else for (const point of state.points) names.add(point.clip);
    }
    for (const name of names) {
      const source = THREE.AnimationClip.findByName(clips, name);
      if (source === null) continue;
      // Mixer actions are cached by clip UUID; each layer needs independent time and weight.
      let clip = source.clone();
      if (layer.mask !== undefined) {
        const mask = layer.mask;
        clip = new THREE.AnimationClip(
          `${source.name}|${layer.id}`,
          source.duration,
          source.tracks.filter((track) => mask.some((prefix) => track.name.startsWith(prefix))),
        );
      }
      if (layer.additive === true) {
        THREE.AnimationUtils.makeClipAdditive(clip);
      }
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
      action.paused = true;
      action.weight = 0;
      if (layer.additive === true) action.blendMode = THREE.AdditiveAnimationBlendMode;
      action.play();
      actions.set(actionKey(layer.id, name), action);
    }
  }
  return {
    runtime: createAnimGraphRuntime(graph, { rng }),
    actions,
    durations,
    rootBone,
    rootBindPosition: rootBone?.position.clone() ?? null,
    lastPos: null,
    smoothedSpeed: 0,
    params: {},
  };
}

/**
 * The engine's model animation driver as a standalone hook — the same mixer `EntityModel` runs,
 * for games that render a cloned scene themselves (custom materials, procedural composition).
 * Handles `"auto"` derivation from the GLB's clip names, speed-driven idle/walk/run crossfades
 * read from the entity's live position when `instanceId` is set, one-shots fired from
 * `entity.animation` / `combat.hitReaction` / `entity.died`, held poses, and the death clamp.
 * With `animation.graph` set, the headless `AnimGraph` runtime owns every clip's time and weight
 * and the mixer only applies them; clip events surface as `animation.event`.
 * Equivalent same-order config data retains playback across rerenders; actual data edits reset it.
 */
export function useModelAnimation(
  scene: THREE.Object3D,
  clips: THREE.AnimationClip[],
  animationInput: ModelAnimationConfig | "auto" | "none" | undefined,
  instanceId?: string,
): void {
  const invalidate = useThree((state) => state.invalidate);
  // Optional: a model must still animate its bind pose / auto clip in a preview or inspector that
  // has no running game — a hard context requirement made every part composition unviewable outside
  // the world, which is half of why #1588 took a session to see.
  const ctx = useOptionalGameContext();

  // "auto" (stamped by catalog resolution, or set inline) derives states/one-shots from the
  // loaded GLB's actual clip names; "none" and absent render the bind pose.
  // Equivalent fresh JSON data retains playback, pending triggers and visual RNG.
  // The private snapshot observes edits on render, including reused nested objects.
  // Preserve one-shot insertion order: simultaneous non-death triggers depend on it.
  const animationKey = JSON.stringify(animationInput);
  const animation = useMemo(
    () =>
      resolveAnimationConfig(
        animationKey === undefined ? undefined : JSON.parse(animationKey) as ModelAnimationConfig | "auto" | "none",
        clips.map((clip) => clip.name),
      ),
    [animationKey, clips],
  );

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const animationPausedRef = useRef(false);
  const graphRef = useRef<GraphPlayback | null>(null);
  const states = animation?.states;
  const oneShots = animation?.oneShots;
  const authoredGraph = animation?.graph;
  const graph = useMemo(() => animGraphFromConfig({ graph: authoredGraph, states, oneShots }), [authoredGraph, states, oneShots]);

  useEffect(() => {
    if (animation !== undefined) warnAnimationDiagnostics(scene, animation, clips);
    if (animation === undefined || clips.length === 0) {
      mixerRef.current = null;
      actionRef.current = null;
      graphRef.current = null;
      return;
    }
    const mixer = new THREE.AnimationMixer(scene);
    if (graph !== undefined) {
      // Rendering/culling must never advance simulation randomness. Each model has its own
      // reproducible visual stream, independent of other mounted models and gameplay draws.
      const visualRng = seededRng(JSON.stringify(["model-animation", instanceId ?? "preview", clips.map((clip) => clip.name).sort()]));
      graphRef.current = buildGraphPlayback(scene, mixer, graph, clips, visualRng);
      mixer.update(0);
      mixerRef.current = mixer;
      animationPausedRef.current = animation.paused === true;
      invalidate();
      return () => {
        mixer.stopAllAction();
        mixer.uncacheRoot(scene);
        mixerRef.current = null;
        graphRef.current = null;
      };
    }
    const clip = animation.clip !== undefined ? THREE.AnimationClip.findByName(clips, animation.clip) : states === undefined ? clips[0] : undefined;
    if (clip === null || clip === undefined) return;
    const action = mixer.clipAction(clip);
    action.setLoop(animation.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = animation.loop === false;
    action.timeScale = animation.timeScale ?? 1;
    action.enabled = true;
    action.paused = animation.paused === true;
    action.play();
    if (animation.time !== undefined) action.time = animation.time;
    mixer.update(0);
    mixerRef.current = mixer;
    actionRef.current = action;
    animationPausedRef.current = animation.paused === true;
    invalidate();
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      mixerRef.current = null;
      actionRef.current = null;
    };
  }, [
    scene,
    clips,
    animation?.clip,
    animation?.loop,
    animation?.timeScale,
    animation?.paused,
    animation?.time,
    states,
    oneShots,
    graph,
    ctx,
    instanceId,
    invalidate,
  ]);

  useEffect(() => {
    if (ctx === null || instanceId === undefined || (oneShots === undefined && graph === undefined)) return;
    const fire = (event: string) => {
      const playback = graphRef.current;
      if (playback !== null) {
        playback.runtime.trigger(event);
        invalidate();
      }
    };
    const offAnimation = ctx.game.events.on("entity.animation", (event) => {
      if (event.instanceId === instanceId) fire(event.event);
    });
    const offHit = ctx.game.events.on("combat.hitReaction", (event) => {
      if (event.instanceId === instanceId) fire("hit");
    });
    const offDied = ctx.game.events.on("entity.died", (event) => {
      if (event.instanceId === instanceId) fire("death");
    });
    return () => {
      offAnimation();
      offHit();
      offDied();
    };
  }, [ctx, instanceId, oneShots, graph, invalidate]);

  useFrame((_state, delta) => {
    if (animationPausedRef.current || animation?.timeScale === 0) return;
    const playback = graphRef.current;
    if (playback !== null && mixerRef.current !== null) {
      const params = playback.params;
      if (ctx !== null && instanceId !== undefined) {
        const entity = ctx.scene.entity.get(instanceId);
        if (entity !== null && delta > 0) {
          const [x, , z] = entity.position;
          if (playback.lastPos !== null) {
            const dx = x - playback.lastPos[0];
            const dy = entity.position[1] - playback.lastPos[1];
            const dz = z - playback.lastPos[2];
            const snapDistance = ctx.sim.loop.config().snapDistance;
            if (dx * dx + dy * dy + dz * dz > snapDistance * snapDistance) {
              playback.smoothedSpeed = 0;
            } else {
              const instantSpeed = Math.hypot(dx, dz) / delta;
              playback.smoothedSpeed += (instantSpeed - playback.smoothedSpeed) * Math.min(1, delta * 12);
            }
          }
          playback.lastPos = [x, entity.position[1], z];
        }
        readModelAnimationParams(ctx, instanceId, playback.smoothedSpeed, params);
      } else {
        for (const key in params) if (Object.hasOwn(params, key)) delete params[key];
        params[LOCOMOTION_SPEED_PARAM] = playback.smoothedSpeed;
      }
      const out = playback.runtime.advance(delta * (animation?.timeScale ?? 1), params, playback.durations);
      applyGraphClips(playback.actions, out.clips);
      mixerRef.current.update(0);
      if (out.rootMotion === true && playback.rootBone !== null && playback.rootBindPosition !== null) {
        playback.rootBone.position.x = playback.rootBindPosition.x;
        playback.rootBone.position.z = playback.rootBindPosition.z;
      }
      if (ctx !== null && instanceId !== undefined) {
        for (const event of out.events) ctx.game.events.emit("animation.event", { instanceId, name: event.name, clip: event.clip });
      }
      return;
    }
    if (mixerRef.current !== null && actionRef.current?.isRunning()) {
      mixerRef.current.update(delta);
    }
  });
}
