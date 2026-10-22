import type { AnimGraph, AnimLayer, AnimState, AnimTransition } from "./animGraph";

/** A masked, optionally additive overlay layer: a resting clip plus one one-shot state per action. */
export interface ActionLayerInput {
  /** Layer id; also the prefix of its action state ids (`id:action`). */
  id: string;
  /**
   * Bone name prefixes this layer drives (`["spine", "chest", "upperarm"]`). Required and nonempty:
   * an overlay that names no bones would silently drive the whole rig. `UPPER_BODY_MASK` and
   * `LOWER_BODY_MASK` (`@jgengine/core/anim/skeletonStandard`) cover a standard rig.
   */
  mask: readonly string[];
  /**
   * Clip held while no action plays. On an additive layer this state is held at its first frame,
   * which `makeClipAdditive` makes the zero reference, so rest contributes nothing to the pose.
   */
  rest: string;
  /** Trigger name → clip, or clips for a random variant, played once over the rest state. */
  actions: Readonly<Record<string, string | readonly string[]>>;
  /** Add the actions to the base pose instead of replacing the masked bones. Default false. */
  additive?: boolean;
  /** Layer influence `0..1`. Default 1. */
  weight?: number;
  /** Crossfade seconds into and out of an action. Default 0.1. */
  fadeSec?: number;
  /** Normalized time an action must reach before it returns to rest. Default 1. */
  exitTime?: number;
}

/** State id of an action layer's resting state. */
export const ACTION_REST_STATE = "rest";

/**
 * One overlay layer from plain data: a resting state plus a one-shot state per action, each joined
 * to the rest by a consumed-trigger transition and returning on `exitTime`. Aim, reload, wave and
 * hit reactions are the same shape, so they are one builder instead of a hand-written state machine
 * per game. The layer is masked by bone prefix, and `additive: true` makes it a recoil/breathing
 * overlay on top of the base pose rather than a replacement.
 *
 * @capability animation build a masked one-shot overlay layer for upper-body actions and hit reactions
 */
export function actionLayer(input: ActionLayerInput): AnimLayer {
  const mask = input.mask.map((prefix) => prefix.trim()).filter((prefix) => prefix.length > 0);
  if (mask.length === 0) throw new Error(`action layer "${input.id}" needs at least one bone name prefix in its mask`);
  if (input.rest.trim().length === 0) throw new Error(`action layer "${input.id}" needs a nonempty rest clip`);
  const fade = input.fadeSec ?? 0.1;
  const exitTime = input.exitTime ?? 1;
  const states: Record<string, AnimState> = {
    [ACTION_REST_STATE]: input.additive === true
      ? { kind: "clip", clip: input.rest, loop: true, speed: 0 }
      : { kind: "clip", clip: input.rest, loop: true },
  };
  const transitions: AnimTransition[] = [];
  for (const [name, spec] of Object.entries(input.actions)) {
    const clips = typeof spec === "string" ? [spec] : spec;
    if (clips.length === 0 || clips[0]!.trim().length === 0) continue;
    if (name === ACTION_REST_STATE) throw new Error(`action layer "${input.id}" cannot name an action "${ACTION_REST_STATE}"; that id is the resting state`);
    states[name] = { kind: "clip", clip: clips[0]!, loop: false, ...(clips.length < 2 ? {} : { variants: [...clips] }) };
    transitions.push({ from: ACTION_REST_STATE, to: name, trigger: name, duration: fade });
    transitions.push({ from: name, to: ACTION_REST_STATE, exitTime, duration: fade });
  }
  return {
    id: input.id,
    entry: ACTION_REST_STATE,
    states,
    transitions,
    mask,
    ...(input.additive === true ? { additive: true } : {}),
    ...(input.weight === undefined ? {} : { weight: input.weight }),
  };
}

/**
 * A graph plus overlay layers: the base layers keep their ids and order, and each overlay is
 * appended. Duplicate layer ids are rejected rather than silently shadowing, because the shell keys
 * its mixer actions by layer id.
 *
 * @capability animation attach masked action layers to a locomotion graph
 */
export function withActionLayers(graph: AnimGraph, layers: readonly ActionLayerInput[]): AnimGraph {
  const ids = new Set(graph.layers.map((layer) => layer.id));
  const built: AnimLayer[] = [];
  for (const input of layers) {
    if (ids.has(input.id)) throw new Error(`animation graph already has a layer "${input.id}"`);
    ids.add(input.id);
    built.push(actionLayer(input));
  }
  return { layers: [...graph.layers, ...built], ...(graph.events === undefined ? {} : { events: graph.events }) };
}
