import { useFrame } from "@react-three/fiber";
import { useEffect } from "react";
import type { Object3D } from "three";
import { Behaviour, type BehaviourWorld } from "@jgengine/core/behaviour/behaviour";

/**
 * A core `Behaviour` bound to a three.js object. `onBeforeRender`/`onAfterRender`
 * ride the object's own three.js render callbacks, so they only fire for renderable
 * objects (Mesh, Line, Points, Sprite) that are visible and in frustum — attach to
 * the mesh itself, not a parent Group, when you need them.
 */
export class Object3DBehaviour extends Behaviour {
  /** @internal */ _object: Object3D | null = null;

  /** The bound three.js object; available from `onAwake` onward. */
  get object(): Object3D {
    if (this._object === null) throw new Error("behaviour is not bound to an Object3D");
    return this._object;
  }

  onBeforeRender(): void {}
  onAfterRender(): void {}
}

/**
 * Binds `behaviour` to `object` and attaches it to `world` under `nodeId`
 * (default: the object's uuid). Render hooks are chained onto the object's
 * existing `onBeforeRender`/`onAfterRender` only when actually overridden, and
 * are gated on the behaviour being active; the update lifecycle still flows
 * through `world.update`.
 */
export function attachObject3D<T extends Object3DBehaviour>(
  world: BehaviourWorld,
  object: Object3D,
  behaviour: T,
  nodeId: string = object.uuid,
): T {
  behaviour._object = object;
  world.attach(nodeId, behaviour);
  if (behaviour.onBeforeRender !== Object3DBehaviour.prototype.onBeforeRender) {
    const previous = object.onBeforeRender;
    object.onBeforeRender = function chainedBeforeRender(...args) {
      previous.apply(this, args);
      if (behaviour.isActive) behaviour.onBeforeRender();
    };
  }
  if (behaviour.onAfterRender !== Object3DBehaviour.prototype.onAfterRender) {
    const previous = object.onAfterRender;
    object.onAfterRender = function chainedAfterRender(...args) {
      previous.apply(this, args);
      if (behaviour.isActive) behaviour.onAfterRender();
    };
  }
  return behaviour;
}

/**
 * Bootstraps `world` on mount and dispatches `world.update` every frame at
 * simulation priority. `scaleDt` maps the raw frame delta to the dt behaviours
 * receive — pass the game clock's scaling to keep behaviours on game time, or
 * omit for real-time seconds. Games driving `world.update` themselves from
 * `loop.onTick` should not also render this.
 */
export function useBehaviourWorld(world: BehaviourWorld, scaleDt?: (rawDt: number) => number): void {
  useEffect(() => {
    world.start();
  }, [world]);
  useFrame((_state, rawDt) => {
    world.update(scaleDt === undefined ? rawDt : scaleDt(rawDt));
  });
}
