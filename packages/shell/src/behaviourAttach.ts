import type { Object3D } from "three";
import { Behaviour, type BehaviourWorld } from "@jgengine/core/behaviour/behaviour";

export class Object3DBehaviour extends Behaviour {
  /** @internal */ _object: Object3D | null = null;

  get object(): Object3D {
    if (this._object === null) throw new Error("behaviour is not bound to an Object3D");
    return this._object;
  }

  onBeforeRender(): void {}
  onAfterRender(): void {}
}

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
