import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { ModelAnimationConfig } from "@jgengine/core/game/playableGame";
import { resolveAnimationConfig } from "@jgengine/core/game/clipRoles";
import { resolveOneShotClip } from "@jgengine/core/game/modelAnimation";
import { useGameContext } from "@jgengine/react/provider";

/**
 * The engine's model animation driver as a standalone hook — the same mixer `EntityModel` runs,
 * for games that render a cloned scene themselves (custom materials, procedural composition).
 * Handles `"auto"` derivation from the GLB's clip names, speed-driven idle/walk/run crossfades
 * read from the entity's live position when `instanceId` is set, one-shots fired from
 * `entity.animation` / `combat.hitReaction` / `entity.died`, held poses, and the death clamp.
 */
export function useModelAnimation(
  scene: THREE.Object3D,
  clips: THREE.AnimationClip[],
  animationInput: ModelAnimationConfig | "auto" | "none" | undefined,
  instanceId?: string,
): void {
  const ctx = useGameContext();

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
  const stateActionsRef = useRef<{
    actions: Partial<Record<"idle" | "walk" | "run", THREE.AnimationAction>>;
    active: "idle" | "walk" | "run";
    lastPos: [number, number, number] | null;
    smoothedSpeed: number;
  } | null>(null);
  const states = animation?.states;
  const oneShots = animation?.oneShots;
  const oneShotPlayRef = useRef<((event: string) => void) | null>(null);
  const activeOneShotRef = useRef<{ action: THREE.AnimationAction; isDeath: boolean } | null>(null);

  useEffect(() => {
    if (animation === undefined || clips.length === 0) {
      mixerRef.current = null;
      stateActionsRef.current = null;
      return;
    }
    const mixer = new THREE.AnimationMixer(scene);
    if (states !== undefined) {
      const clipFor = (name: string) => THREE.AnimationClip.findByName(clips, name) ?? clips[0]!;
      const actions: Partial<Record<"idle" | "walk" | "run", THREE.AnimationAction>> = {
        idle: mixer.clipAction(clipFor(states.idle)),
        walk: mixer.clipAction(clipFor(states.walk)),
        ...(states.run === undefined ? {} : { run: mixer.clipAction(clipFor(states.run)) }),
      };
      for (const action of Object.values(actions)) {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.timeScale = animation.timeScale ?? 1;
        action.enabled = true;
      }
      actions.idle!.play();
      mixer.update(0);
      mixerRef.current = mixer;
      stateActionsRef.current = { actions, active: "idle", lastPos: null, smoothedSpeed: 0 };
      animationPausedRef.current = false;

      let onOneShotFinished: ((event: { action: THREE.AnimationAction }) => void) | null = null;
      if (oneShots !== undefined) {
        const clipNames = new Set<string>();
        for (const spec of Object.values(oneShots)) {
          if (typeof spec === "string") clipNames.add(spec);
          else for (const name of spec) clipNames.add(name);
        }
        const oneShotActions = new Map<string, THREE.AnimationAction>();
        for (const name of clipNames) {
          const found = THREE.AnimationClip.findByName(clips, name);
          if (found === null) continue;
          const oneShotAction = mixer.clipAction(found);
          oneShotAction.setLoop(THREE.LoopOnce, 1);
          oneShotAction.enabled = true;
          oneShotActions.set(name, oneShotAction);
        }
        onOneShotFinished = ({ action }) => {
          const active = activeOneShotRef.current;
          if (active === null || action !== active.action || active.isDeath) return;
          const machine = stateActionsRef.current;
          const back = machine?.actions[machine.active];
          action.fadeOut(0.15);
          if (back !== undefined) back.reset().fadeIn(0.15).play();
          activeOneShotRef.current = null;
        };
        mixer.addEventListener("finished", onOneShotFinished);
        oneShotPlayRef.current = (event: string) => {
          const active = activeOneShotRef.current;
          if (active !== null && active.isDeath) return;
          const clipName = resolveOneShotClip(oneShots, event, Math.random());
          if (clipName === null) return;
          const oneShotAction = oneShotActions.get(clipName);
          if (oneShotAction === undefined) return;
          const machine = stateActionsRef.current;
          machine?.actions[machine.active]?.fadeOut(0.1);
          if (active !== null && active.action !== oneShotAction) active.action.stop();
          oneShotAction.clampWhenFinished = event === "death";
          oneShotAction.reset().fadeIn(0.1).play();
          activeOneShotRef.current = { action: oneShotAction, isDeath: event === "death" };
        };
      }

      return () => {
        if (onOneShotFinished !== null) mixer.removeEventListener("finished", onOneShotFinished);
        oneShotPlayRef.current = null;
        activeOneShotRef.current = null;
        mixer.stopAllAction();
        mixerRef.current = null;
        stateActionsRef.current = null;
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
  ]);

  useEffect(() => {
    if (instanceId === undefined || oneShots === undefined) return;
    const fire = (event: string) => oneShotPlayRef.current?.(event);
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
  }, [ctx, instanceId, oneShots]);

  useFrame((_state, delta) => {
    const stateMachine = stateActionsRef.current;
    if (stateMachine !== null && states !== undefined && instanceId !== undefined && delta > 0) {
      const entity = ctx.scene.entity.get(instanceId);
      if (entity !== null) {
        const [x, , z] = entity.position;
        if (stateMachine.lastPos !== null) {
          const instantSpeed =
            Math.hypot(x - stateMachine.lastPos[0], z - stateMachine.lastPos[2]) / delta;
          stateMachine.smoothedSpeed +=
            (instantSpeed - stateMachine.smoothedSpeed) * Math.min(1, delta * 12);
        }
        stateMachine.lastPos = [x, entity.position[1], z];
        const walkSpeed = states.walkSpeed ?? 0.5;
        const runSpeed = states.runSpeed ?? 6;
        const next: "idle" | "walk" | "run" =
          stateMachine.smoothedSpeed < walkSpeed
            ? "idle"
            : stateMachine.actions.run !== undefined && stateMachine.smoothedSpeed >= runSpeed
              ? "run"
              : "walk";
        if (next !== stateMachine.active) {
          if (activeOneShotRef.current === null) {
            const fade = states.fadeSec ?? 0.2;
            const from = stateMachine.actions[stateMachine.active];
            const to = stateMachine.actions[next];
            if (from !== undefined && to !== undefined) {
              to.reset().fadeIn(fade).play();
              from.fadeOut(fade);
            }
          }
          stateMachine.active = next;
        }
      }
    }
    if (mixerRef.current !== null && !animationPausedRef.current) mixerRef.current.update(delta);
  });
}
