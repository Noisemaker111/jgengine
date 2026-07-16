import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { BehaviourWorld } from "@jgengine/core/behaviour/behaviour";
import { createBehaviourWorldDriver } from "./behaviourDriver";

export { createBehaviourWorldDriver } from "./behaviourDriver";
export { attachObject3D, Object3DBehaviour } from "./behaviourAttach";

/**
 * Bootstraps `world` on mount and dispatches `world.update` every frame at
 * simulation priority. Stops driving updates on unmount so remount does not
 * double-step. `scaleDt` maps the raw frame delta to the dt behaviours
 * receive — pass the game clock's scaling to keep behaviours on game time, or
 * omit for real-time seconds. Games driving `world.update` themselves from
 * `loop.onTick` should not also render this.
  * @internal
  */
export function useBehaviourWorld(world: BehaviourWorld, scaleDt?: (rawDt: number) => number): void {
  const driverRef = useRef(createBehaviourWorldDriver(world));
  useEffect(() => {
    const driver = createBehaviourWorldDriver(world);
    driverRef.current = driver;
    driver.start();
    return () => {
      driver.stop();
    };
  }, [world]);
  useFrame((_state, rawDt) => {
    driverRef.current.step(scaleDt === undefined ? rawDt : scaleDt(rawDt));
  });
}
