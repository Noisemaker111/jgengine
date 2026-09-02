import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { ModelAnimationConfig } from "@jgengine/core/game/playableGame";
import { resolveAnimationConfig } from "@jgengine/core/game/clipRoles";
import {
  ANIM_PARAMS_KEY,
  createAnimGraphRuntime,
  type AnimGraph,
  type AnimGraphRuntime,
  type AnimParamValue,
} from "@jgengine/core/anim/animGraph";
import { LOCOMOTION_SPEED_PARAM, locomotionGraph } from "@jgengine/core/anim/locomotionGraph";
import { useOptionalGameContext } from "@jgengine/react/provider";

function graphClipNames(graph: AnimGraph): Set<string> {
  const names = new Set<string>();
  for (const layer of graph.layers) {
    for (const state of Object.values(layer.states)) {
      if (state.kind === "clip") names.add(state.clip);
      else for (const point of state.points) names.add(point.clip);
    }
  }
  return names;
}

/**
 * An explicit `animation` config always wins over `"auto"`, and both the state machine and the
 * one-shot table degrade quietly when a named clip is absent: states fall back to `clips[0]` (often
 * an attack clip, so an actor "idles" mid-swing) and one-shots are dropped, so deaths and attacks
 * never play. Neither leaves a trace, which makes a mistyped or wrong-pack clip name one of the
 * hardest render bugs to see — the model loads, animates, and is simply wrong forever.
 *
 * Warn once per mount with the names that missed and the names the rig actually has, so the fix
 * (usually deleting the hand-written config and letting `"auto"` derive it) is obvious.
 */
function warnMissingClips(
  animation: ModelAnimationConfig,
  clips: readonly THREE.AnimationClip[],
): void {
  if (typeof console === "undefined") return;
  const available = new Set(clips.map((clip) => clip.name));
  const missing = new Set<string>();
  const { states, oneShots, graph } = animation;
  if (states !== undefined) {
    for (const name of [states.idle, states.walk, states.run]) {
      if (name !== undefined && !available.has(name)) missing.add(name);
    }
  }
  if (oneShots !== undefined) {
    for (const spec of Object.values(oneShots)) {
      for (const name of typeof spec === "string" ? [spec] : spec) {
        if (!available.has(name)) missing.add(name);
      }
    }
  }
  if (graph !== undefined) {
    for (const name of graphClipNames(graph)) if (!available.has(name)) missing.add(name);
  }
  if (animation.clip !== undefined && !available.has(animation.clip)) missing.add(animation.clip);
  if (missing.size === 0) return;
  console.warn(
    `[jgengine] model animation: clip(s) ${[...missing].map((name) => `"${name}"`).join(", ")} ` +
      `not found on this rig. Available: ${clips.map((clip) => clip.name).join(", ")}. ` +
      `States fall back to the first clip and one-shots are skipped — set animation: "auto" to ` +
      `derive states/one-shots from the rig's own clip names.`,
  );
}

interface GraphPlayback {
  runtime: AnimGraphRuntime;
  actions: Map<string, THREE.AnimationAction>;
  durations: Record<string, { duration: number; rootTrack?: { times: Float32Array; values: Float32Array } }>;
  rootBone: THREE.Bone | null;
  rootBindPosition: THREE.Vector3 | null;
  lastPos: [number, number, number] | null;
  smoothedSpeed: number;
}

/** Per-layer action key: a masked or additive layer needs its own clip variant even for a clip another layer plays. */
function actionKey(layer: string, clip: string): string {
  return `${layer}:${clip}`;
}

function buildGraphPlayback(scene: THREE.Object3D, mixer: THREE.AnimationMixer, graph: AnimGraph, clips: THREE.AnimationClip[]): GraphPlayback {
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
      if (state.kind === "clip") names.add(state.clip);
      else for (const point of state.points) names.add(point.clip);
    }
    for (const name of names) {
      const source = THREE.AnimationClip.findByName(clips, name);
      if (source === null) continue;
      let clip = source;
      if (layer.mask !== undefined) {
        const mask = layer.mask;
        clip = new THREE.AnimationClip(
          `${source.name}|${layer.id}`,
          source.duration,
          source.tracks.filter((track) => mask.some((prefix) => track.name.startsWith(prefix))),
        );
      }
      if (layer.additive === true) {
        clip = clip === source ? clip.clone() : clip;
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
    runtime: createAnimGraphRuntime(graph),
    actions,
    durations,
    rootBone,
    rootBindPosition: rootBone?.position.clone() ?? null,
    lastPos: null,
    smoothedSpeed: 0,
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
 */
export function useModelAnimation(
  scene: THREE.Object3D,
  clips: THREE.AnimationClip[],
  animationInput: ModelAnimationConfig | "auto" | "none" | undefined,
  instanceId?: string,
): void {
  // Optional: a model must still animate its bind pose / auto clip in a preview or inspector that
  // has no running game — a hard context requirement made every part composition unviewable outside
  // the world, which is half of why #1588 took a session to see.
  const ctx = useOptionalGameContext();

  // "auto" (stamped by catalog resolution, or set inline) derives states/one-shots from the
  // loaded GLB's actual clip names; "none" and absent render the bind pose.
  const animation = useMemo(
    () =>
      resolveAnimationConfig(
        animationInput,
        clips.map((clip) => clip.name),
      ),
    [animationInput, clips],
  );

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationPausedRef = useRef(false);
  const graphRef = useRef<GraphPlayback | null>(null);
  const states = animation?.states;
  const oneShots = animation?.oneShots;
  const graph = useMemo(() => {
    if (animation?.graph !== undefined) return animation.graph;
    if (states === undefined) return undefined;
    const graphOneShots: Record<string, string> = {};
    for (const [event, spec] of Object.entries(oneShots ?? {})) {
      const clip = typeof spec === "string" ? spec : spec[0];
      if (clip !== undefined) graphOneShots[event] = clip;
    }
    return locomotionGraph({
      idle: states.idle,
      walk: states.walk,
      ...(states.run === undefined ? {} : { run: states.run }),
      walkSpeed: states.walkSpeed,
      runSpeed: states.runSpeed,
      fadeSec: states.fadeSec,
      ...(Object.keys(graphOneShots).length === 0 ? {} : { oneShots: graphOneShots }),
    });
  }, [animation?.graph, states, oneShots]);

  useEffect(() => {
    if (animation === undefined || clips.length === 0) {
      mixerRef.current = null;
      graphRef.current = null;
      return;
    }
    warnMissingClips(animation, clips);
    const mixer = new THREE.AnimationMixer(scene);
    if (graph !== undefined) {
      graphRef.current = buildGraphPlayback(scene, mixer, graph, clips);
      mixer.update(0);
      mixerRef.current = mixer;
      animationPausedRef.current = false;
      return () => {
        mixer.stopAllAction();
        mixerRef.current = null;
        graphRef.current = null;
      };
    }
    const clip =
      (animation.clip !== undefined ? THREE.AnimationClip.findByName(clips, animation.clip) : undefined) ??
      clips[0]!;
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
    animationPausedRef.current = animation.paused === true;
    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
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
  ]);

  useEffect(() => {
    if (ctx === null || instanceId === undefined || (oneShots === undefined && graph === undefined)) return;
    const fire = (event: string) => {
      const playback = graphRef.current;
      if (playback !== null) playback.runtime.trigger(event);
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
  }, [ctx, instanceId, oneShots, graph]);

  useFrame((_state, delta) => {
    const playback = graphRef.current;
    if (playback !== null && mixerRef.current !== null) {
      const params: Record<string, AnimParamValue> = {};
      if (ctx !== null && instanceId !== undefined) {
        const entity = ctx.scene.entity.get(instanceId);
        if (entity !== null && delta > 0) {
          const [x, , z] = entity.position;
          if (playback.lastPos !== null) {
            const instantSpeed = Math.hypot(x - playback.lastPos[0], z - playback.lastPos[2]) / delta;
            playback.smoothedSpeed += (instantSpeed - playback.smoothedSpeed) * Math.min(1, delta * 12);
          }
          playback.lastPos = [x, entity.position[1], z];
        }
        const extra = ctx.scene.entity.blackboard.get<Record<string, AnimParamValue>>(instanceId, ANIM_PARAMS_KEY);
        if (extra !== undefined) Object.assign(params, extra);
      }
      params[LOCOMOTION_SPEED_PARAM] = playback.smoothedSpeed;
      const out = playback.runtime.advance(delta * (animation?.timeScale ?? 1), params, playback.durations);
      for (const action of playback.actions.values()) action.weight = 0;
      for (const entry of out.clips) {
        const action = playback.actions.get(actionKey(entry.layer, entry.clip));
        if (action === undefined) continue;
        action.weight += entry.weight;
        action.time = entry.time;
      }
      mixerRef.current.update(0);
      const currentPlayback = graphRef.current;
      if (currentPlayback !== null && currentPlayback.rootBone !== null && currentPlayback.rootBindPosition !== null) {
        currentPlayback.rootBone.position.copy(currentPlayback.rootBindPosition);
      }
      if (ctx !== null && instanceId !== undefined) {
        const rootDelta = out.rootDelta;
        const entity = rootDelta === undefined ? null : ctx.scene.entity.get(instanceId);
        if (entity !== null && rootDelta !== undefined) {
          ctx.scene.entity.setPose(instanceId, {
            position: [entity.position[0] + rootDelta[0], entity.position[1] + rootDelta[1], entity.position[2] + rootDelta[2]],
            dt: delta,
          });
        }
        for (const event of out.events) ctx.game.events.emit("animation.event", { instanceId, name: event.name, clip: event.clip });
      }
      return;
    }
    if (mixerRef.current !== null && !animationPausedRef.current) mixerRef.current.update(delta);
  });
}
