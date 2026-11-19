import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { menuFocus } from "./ui/CommandMenu";
import { newCampaignRecord, refreshCampaignSlots, saveCampaignRecord } from "./menuSave";

export function registerMenuCapture(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define("menu.record", {
    apply(state) {
      void (async () => {
        await newCampaignRecord(state, "campaign-1", "Mara Vell");
        state.game.commands.run("match.start", {});
        await saveCampaignRecord(state, "Mara Vell");
        state.game.commands.run("match.title", {});
        await refreshCampaignSlots(state);
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
