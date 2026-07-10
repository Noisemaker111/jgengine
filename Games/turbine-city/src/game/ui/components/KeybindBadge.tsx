import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { PALETTE } from "./theme";

export function KeybindBadge({ action }: { action: string }) {
  const label = actionLabel(keybinds, action) ?? "?";
  return (
    <span
      className="inline-flex min-w-[1.8rem] items-center justify-center rounded border px-1.5 py-0.5 text-[11px] font-bold tracking-wide"
      style={{ borderColor: `${PALETTE.citySlate}66`, backgroundColor: "#12202180", color: PALETTE.cloudWhite }}
    >
      {label}
    </span>
  );
}
