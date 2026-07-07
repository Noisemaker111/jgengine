import { Users } from "lucide-react";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGameStore, usePlayer } from "@jgengine/react/hooks";
import { keybinds } from "../../keybinds";
import { SQUIRE_COMPANION_ID } from "../../loop";
import { wowMicroButtonIdle } from "../wowStyles";
import { KeybindBadge } from "./KeybindBadge";

export function PossessionBadge() {
  const { userId } = usePlayer();
  const activeId = useGameStore((ctx) => ctx.player.possession.active(userId));
  const owned = useGameStore((ctx) => ctx.player.possession.listOwned(userId));
  if (owned.length <= 1) return null;

  const controllingSquire = activeId === SQUIRE_COMPANION_ID;

  return (
    <div
      className={[
        "pointer-events-auto flex items-center gap-2 rounded-md border-2 px-3 py-1.5 text-amber-50 shadow-lg",
        wowMicroButtonIdle,
      ].join(" ")}
    >
      <Users className="h-4 w-4 text-amber-300" />
      <span className="text-xs font-semibold uppercase tracking-wide">
        Controlling {controllingSquire ? "Squire" : "Hero"}
      </span>
      <KeybindBadge label={actionLabel(keybinds, "swapControl") ?? "—"} />
    </div>
  );
}
