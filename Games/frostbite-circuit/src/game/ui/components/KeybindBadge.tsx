import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useDisplayProfile } from "@jgengine/react";

import { keybinds } from "../../keybinds";
import { PALETTE } from "../theme";

export function KeybindBadge({ action }: { action: string }) {
  const { coarsePointer } = useDisplayProfile();
  const label = actionLabel(keybinds, action) ?? "?";
  if (coarsePointer) return null;
  return (
    <span
      className="inline-flex min-w-[1.6rem] items-center justify-center rounded border px-1.5 py-0.5 text-[11px] font-bold tracking-wide"
      style={{ borderColor: `${PALETTE.iceBlue}66`, backgroundColor: PALETTE.deepWater, color: PALETTE.snowWhite }}
    >
      {label}
    </span>
  );
}
