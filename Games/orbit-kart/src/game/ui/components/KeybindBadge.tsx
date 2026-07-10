import { actionLabel } from "@jgengine/core/input/actionBindings";
import { keybinds } from "../../keybinds";

export function KeybindBadge({ action }: { action: string }) {
  const label = actionLabel(keybinds, action) ?? "?";
  return (
    <span className="inline-flex min-w-[1.7rem] items-center justify-center rounded border border-[#f5f3ff]/40 bg-[#0a0820] px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-[#f5f3ff]">
      {label}
    </span>
  );
}
