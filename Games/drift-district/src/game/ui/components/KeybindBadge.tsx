import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useDisplayProfile } from "@jgengine/react";

import { keybinds } from "../../keybinds";

export function KeybindBadge({ action }: { action: string }) {
  const { coarsePointer } = useDisplayProfile();
  const label = actionLabel(keybinds, action) ?? "?";
  if (coarsePointer) return null;
  return (
    <span className="inline-flex min-w-[1.6rem] items-center justify-center rounded border border-[#e8e6f0]/40 bg-[#0d0d13] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-[#e8e6f0]">
      {label}
    </span>
  );
}
