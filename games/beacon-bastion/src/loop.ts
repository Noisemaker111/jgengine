import type { GameContext, GameLoop } from "@jgengine/shell/gameKit";

import { openTitle } from "./game/menu";
import { beaconSave, saveToSlot } from "./game/save";
import { menuFocus } from "./game/ui/menu/BeaconMenu";
import { keepProfile } from "./game/thumbs";
import { setupWorld } from "./game/world/setup";

export const loop: GameLoop<GameContext> = {
  onInit(ctx) {
    setupWorld(ctx);
    // Boot to the keep's title: the world stands behind it, the clock does not run.
    openTitle(ctx);
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
        menuFocus.id = null;
        openTitle(state);
        return state;
      },
    });
    ctx.game.commands.define("menu.keeps", {
      apply: (state) => {
        menuFocus.id = "keeps";
        openTitle(state);
        return state;
      },
    });
    ctx.game.commands.define("menu.new", {
      apply: (state) => {
        menuFocus.id = "new";
        openTitle(state);
        return state;
      },
    });
  },
  onNewPlayer() {},
};

