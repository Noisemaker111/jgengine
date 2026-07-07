import { PawPrint } from "lucide-react";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useGameStore, usePlayer } from "@jgengine/react/hooks";
import { keybinds } from "../../keybinds";
import { SQUIRE_COMPANION_ID } from "../../loop";
import { wowMicroButtonActive, wowMicroButtonIdle } from "../wowStyles";
import { KeybindBadge } from "./KeybindBadge";

const FORM_LABELS: Record<string, string> = {
  wolf_form: "Wolf Form",
};

export function FormBadge() {
  const { userId } = usePlayer();
  const controlledId = useGameStore((ctx) => ctx.player.possession.active(userId));
  const activeForm = useGameStore((ctx) => ctx.scene.entity.form.active(controlledId));
  const controllingSquire = controlledId === SQUIRE_COMPANION_ID;

  return (
    <div
      className={[
        "pointer-events-auto flex items-center gap-2 rounded-md border-2 px-3 py-1.5 text-amber-50 shadow-lg transition",
        activeForm !== null ? wowMicroButtonActive : wowMicroButtonIdle,
      ].join(" ")}
    >
      <PawPrint className={activeForm !== null ? "h-4 w-4 text-amber-200" : "h-4 w-4 text-stone-400"} />
      <span className="text-xs font-semibold uppercase tracking-wide">
        {activeForm !== null ? (FORM_LABELS[activeForm] ?? activeForm) : "Human Form"}
      </span>
      {controllingSquire ? null : <KeybindBadge label={actionLabel(keybinds, "shapeshift") ?? "—"} />}
    </div>
  );
}
