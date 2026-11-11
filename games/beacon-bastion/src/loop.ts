import type { GameContext, GameLoop } from "@jgengine/shell/gameKit";

import { openKeepTitle } from "./game/menu";
import { beaconSave, saveToSlot } from "./game/save";
import { focusMenu } from "./game/ui/menu/BeaconMenu";
import { keepProfile } from "./game/thumbs";
import { setupWorld } from "./game/world/setup";

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
    // Boot to the keep's title: the world stands behind it, the clock does not run.
    openKeepTitle(ctx);
    // The menu states a capture host reaches: hold the keep, then stand in front of it.
    ctx.game.commands.define("menu.commander", {
      apply: (state, input) => {
        const value = (input as { commander?: string } | undefined)?.commander;
        keepProfile.commander = typeof value === "string" && value.length > 0 ? value : null;
        return state;
      },
    });
    ctx.game.commands.define("menu.save", {
      apply: (state) => {
        void saveToSlot(state, beaconSave(state).slot());
        return state;
      },
    });
    ctx.game.commands.define("menu.title", {
      apply: (state) => {
        openKeepTitle(state);
        focusMenu(null);
        return state;
      },
    });
    ctx.game.commands.define("menu.keeps", {
      apply: (state) => {
        openKeepTitle(state);
        focusMenu("keeps");
        return state;
      },
    });
    ctx.game.commands.define("menu.new", {
      apply: (state) => {
        openKeepTitle(state);
        focusMenu("new");
        return state;
      },
    });
  },
  onNewPlayer() {},
};

