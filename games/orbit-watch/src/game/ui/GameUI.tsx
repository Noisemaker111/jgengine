import type { ReactNode } from "react";
import { useGamePhase } from "@jgengine/react/hooks";

import { Hud } from "./Hud";
import { PauseMenu, TitleMenu } from "./Menus";

/** Title over the standing world, the HUD while playing, the pause menu over it, the end card after. */
export function GameUI(): ReactNode {
  const { phase } = useGamePhase();
  return (
    <>
      {phase === "menu" ? <TitleMenu /> : <Hud />}
      {phase === "paused" ? <PauseMenu /> : null}
    </>
  );
}
