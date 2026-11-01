import type { ReactNode } from "react";
import { BaseStructures } from "../../engine-local/basebuilding/BaseStructures.draw";
import type { WorldOverlayProps } from "@jgengine/core/game/playableGame";
import { OnboardingPointer } from "@jgengine/core/onboarding/OnboardingPointer.draw";

import { baseBuilding, baseGhost, structureColor } from "../base";
import { Bodies } from "./Bodies";
import { BroodLair } from "./Broodmother";
import { Caves } from "./Caves";
import { Eggs } from "./Eggs";
import { Obelisks } from "./Obelisks";
import { SupplyDrops } from "./SupplyDrops";

/** What the game draws into the world: the survivor's base (pieces by tier colour, the build ghost), the obelisks, the caves, fallen survivors' bodies, supply crates, fertilized eggs and the Broodmother's lair. */
export function BaseWorld({ ctx }: WorldOverlayProps): ReactNode {
  return (
    <>
      <BaseStructures building={baseBuilding(ctx)} colorOf={structureColor} ghost={() => baseGhost(ctx)} />
      <Obelisks ctx={ctx} />
      <Caves ctx={ctx} />
      <Bodies ctx={ctx} />
      <SupplyDrops ctx={ctx} />
      <Eggs ctx={ctx} />
      <BroodLair ctx={ctx} />
      <OnboardingPointer ctx={ctx} />
    </>
  );
}
