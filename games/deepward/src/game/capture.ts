import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { captureRecordThumb, refreshRecordSlots } from "./menuRecord";
import { openTitle, persistRecord, stageMidDive } from "./controls";
import { menuFocus } from "./ui/menu/DeepwardMenu";

/**
 * Dev-only staging for the menu's evidence shots. The departure itself is the real one
 * (`stageMidDive` walks through `begin` and the 1.4 s search channel); this only decides that the
 * record is written afterwards and the title is holding it.
 */
export function registerCaptureCommands(ctx: GameContext): void {
  if (!import.meta.env.DEV) return;
  ctx.game.commands.define("menu.record", {
    apply(state) {
      void (async () => {
        if (state.scene.entity.get(state.player.userId) !== null) {
          await stageMidDive(state);
          await captureRecordThumb();
          await persistRecord(state);
        }
        openTitle(state);
        await refreshRecordSlots(state);
      })();
      return state;
    },
  });
  ctx.game.commands.define<{ verb: string | null }>("menu.focus", {
    apply(_state, input) {
      menuFocus.id = typeof input?.verb === "string" ? input.verb : null;
      return _state;
    },
  });
}
