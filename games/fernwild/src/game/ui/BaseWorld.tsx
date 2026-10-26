import type { ReactNode } from "react";
import { BaseStructures } from "@jgengine/core/basebuilding/BaseStructures.draw";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";

import { baseBuilding, baseGhost, structureColor } from "../base";

/** The survivor's base in the world: placed pieces by tier colour and the build ghost. */
export function BaseWorld({ ctx }: WorldOverlayProps): ReactNode {
  return <BaseStructures building={baseBuilding(ctx)} colorOf={structureColor} ghost={() => baseGhost(ctx)} />;
}
