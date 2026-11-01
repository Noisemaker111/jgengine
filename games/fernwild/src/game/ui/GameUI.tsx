import type { ReactNode } from "react";
import { GameFlowUI } from "@jgengine/core/menu/gameFlowMenus.view";

import { useGameFonts } from "@jgengine/core/ui/fonts.view";

import { FERN_FONTS } from "../../art/look";
import { BRIEFING, CONTROLS, CREDITS } from "../controls";
import { CharacterCreator } from "./CharacterCreator";
import { Hud } from "./Hud";

/** Title over the standing island, the survivor HUD while playing, the pause menu over it. */
export function GameUI(): ReactNode {
  useGameFonts(FERN_FONTS);
  return (
    <GameFlowUI
      hud={<Hud />}
      menu={{
        name: "Fernwild",
        tagline: "Wake on the beach. Survive the island.",
        pitch: "Gather, craft, learn engrams, build, and tame the island's dinosaurs.",
        accent: "#3fd0c9",
        controls: CONTROLS,
        briefing: BRIEFING,
        credits: CREDITS,
        newGameSetup: (begin, back) => <CharacterCreator begin={begin} back={back} />,
      }}
    />
  );
}
