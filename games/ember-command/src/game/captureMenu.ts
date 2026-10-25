import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { menuFocus } from "./ui/CommandMenu";
import { newCampaignRecord, refreshCampaignSlots, saveCampaignRecord } from "./menuSave";

/**
 * Dev-only staging for the field desk's evidence shots. A campaign is opened through the menu's own
 * new-campaign path and a mission is started through `match.start`, then the record is written and
 * the field desk is asked for again.
 */
export function registerMenuCapture(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define("menu.record", {
    apply(state) {
      void (async () => {
        await newCampaignRecord(state, "campaign-1", "Mara Vell");
        state.game.commands.run("match.start", {});
        await saveCampaignRecord(state, "Mara Vell");
        state.game.commands.run("match.title", {});
        refreshCampaignSlots();
      })();
      return state;
    },
  });
  ctx.game.commands.define<{ verb: string | null }>("menu.focus", {
    apply(state, input) {
      menuFocus.id = typeof input?.verb === "string" ? input.verb : null;
      return state;
    },
  });
}
