import type { GameContext } from "@jgengine/core/runtime/gameContext";

import type { FanState } from "../flight/fanSchedule";
import { buildCityProps } from "./cityProps";

const ROTOR_SPEED = 4.2;

export function placeCityProps(ctx: GameContext): void {
  for (const prop of buildCityProps()) {
    ctx.scene.object.remove(prop.instanceId);
    ctx.scene.object.place(prop.catalogId, prop.position[0], prop.position[1], prop.position[2], {
      instanceId: prop.instanceId,
      rotation: prop.rotationY,
      visual: prop.scale === undefined ? undefined : { scale: prop.scale },
    });
  }
}

export function syncFanRotors(ctx: GameContext, fanStates: ReadonlyMap<string, FanState>, time: number): void {
  for (const [fanId, state] of fanStates) {
    const angle = time * ROTOR_SPEED * state.direction * state.power;
    ctx.scene.object.rotate(`${fanId}-rotor`, angle);
  }
}
