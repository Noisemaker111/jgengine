import type { BehaviourWorld } from "@jgengine/core/behaviour/behaviour";

export function createBehaviourWorldDriver(world: BehaviourWorld): {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  step(dt: number): void;
} {
  let running = false;
  return {
    start() {
      if (!world.started()) world.start();
      running = true;
    },
    stop() {
      running = false;
    },
    isRunning() {
      return running;
    },
    step(dt) {
      if (!running) return;
      world.update(dt);
    },
  };
}
