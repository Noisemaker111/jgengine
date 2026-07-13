import { actionLabel } from "@jgengine/core/input/actionBindings";
import { useDisplayProfile } from "@jgengine/react";
import { keybinds } from "../../keybinds";

export function KeybindBadge({ action }: { action: string }) {
  const { coarsePointer } = useDisplayProfile();
  const label = actionLabel(keybinds, action) ?? "?";
  if (coarsePointer) return null;
  return (
    <span className="inline-flex min-w-[1.7rem] items-center justify-center rounded border border-[#f5f3ff]/40 bg-[#0a0820] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-[#f5f3ff]">
      {label}
    </span>
  );
}
