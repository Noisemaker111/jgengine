import { actionLabel } from "@jgengine/core/input/actionBindings";
import { keybinds } from "../../keybinds";
import { useStamina } from "../useRunView";

export function StaminaBar() {
  const stamina = useStamina();
  const percent = stamina.max <= 0 ? 0 : (stamina.current / stamina.max) * 100;
  const low = percent < 20;

  return (
    <div className="pointer-events-none flex w-72 flex-col gap-1 rounded-xl border border-[#4a7c59]/50 bg-[#26413c]/90 px-4 py-2.5 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e8d5a3]/70">Stamina</span>
        <kbd className="rounded border border-[#e8d5a3]/40 bg-[#0f1f1c] px-1.5 py-0.5 text-[10px] font-bold text-[#e8d5a3]">
          {actionLabel(keybinds, "sprint")}
        </kbd>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#0f1f1c]">
        <div
          className={`h-full rounded-full transition-[width] ${low ? "bg-[#e76f51]" : "bg-[#4a7c59]"}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}
