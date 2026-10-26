import type { ReactNode } from "react";
import { GameFlowUI } from "@jgengine/core/menu/gameFlowMenus.view";

import { BRIEFING, CONTROLS, CREDITS } from "../controls";
import { Hud } from "./Hud";

/** Title over the standing island, the survivor HUD while playing, the pause menu over it. */
export function GameUI(): ReactNode {
  return (
    <GameFlowUI
      hud={<Hud />}
      menu={{
        name: "Fernwild",
        tagline: "Wake on the beach. Survive the island.",
        pitch: "Gather, craft, learn engrams, build, and tame the island's dinosaurs.",
        accent: "#6fb7c9",
        controls: CONTROLS,
        briefing: BRIEFING,
        credits: CREDITS,
      }}
    />
  );
}
