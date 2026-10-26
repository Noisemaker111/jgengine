import type { ReactNode } from "react";
import { GameFlowUI } from "@jgengine/react/menu/gameFlowMenus";

import { BRIEFING, CONTROLS, CREDITS } from "../controls";
import { idea } from "../idea";
import { Hud } from "./Hud";

/** Title over the standing world, the HUD while playing, the pause menu over it. */
export function GameUI(): ReactNode {
  return (
    <GameFlowUI
      hud={<Hud />}
      menu={{ name: idea.name, tagline: idea.tagline, pitch: idea.pitch, accent: idea.accent, controls: CONTROLS, briefing: BRIEFING, credits: CREDITS }}
    />
  );
}
