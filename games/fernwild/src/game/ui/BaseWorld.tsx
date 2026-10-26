import type { ReactNode } from "react";
import { BaseStructures } from "@jgengine/core/basebuilding/BaseStructures.draw";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";

import { baseBuilding, baseGhost, structureColor } from "../base";
import { Bodies } from "./Bodies";
import { Caves } from "./Caves";
import { Obelisks } from "./Obelisks";

/** What the game draws into the world: the survivor's base (pieces by tier colour, the build ghost), the obelisks, the caves and fallen survivors' bodies. */
export function BaseWorld({ ctx }: WorldOverlayProps): ReactNode {
  return (
    <>
      <BaseStructures building={baseBuilding(ctx)} colorOf={structureColor} ghost={() => baseGhost(ctx)} />
      <Obelisks ctx={ctx} />
      <Caves ctx={ctx} />
      <Bodies ctx={ctx} />
    </>
  );
}
