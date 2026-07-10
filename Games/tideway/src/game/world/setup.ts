import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { BUOYS, SHORE_PROPS, WATER_LEVEL } from "../course/track";
import { BUOY_OBJECT_IDS, PROP_OBJECT_IDS } from "./catalogIds";

const BUOY_BOB_Y = 0.35;

export function placeHarborProps(ctx: GameContext): void {
  for (const buoy of BUOYS) {
    ctx.scene.object.place(BUOY_OBJECT_IDS[buoy.kind], buoy.x, WATER_LEVEL + BUOY_BOB_Y, buoy.z, {
      instanceId: buoy.id,
    });
  }
  for (const prop of SHORE_PROPS) {
    const groundY = ctx.world.groundHeightAt(prop.x, prop.z);
    ctx.scene.object.place(PROP_OBJECT_IDS[prop.kind], prop.x, groundY, prop.z, {
      instanceId: prop.id,
      rotation: prop.rotationY,
    });
  }
}
