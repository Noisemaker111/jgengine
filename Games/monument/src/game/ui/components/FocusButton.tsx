import type { ReactNode } from "react";

import { actionLabel } from "@jgengine/core/input/actionBindings";

import { keybinds } from "../../keybinds";
import { PANEL } from "../theme";
import { Kbd } from "./Kbd";

type Run = (action: string, input?: unknown) => void;

export function FocusButton({ run }: { run: Run }): ReactNode {
  const key = actionLabel(keybinds, "focusToggle") ?? "";
  return (
    <button
      type="button"
      onClick={() => run("focusToggle", {})}
      title="Enter focus mode"
      className={`flex items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#171916] transition hover:bg-[rgba(20,22,18,0.08)] ${PANEL}`}
    >
      <span className="text-[12px] leading-none">◉</span>
      Focus
      <Kbd label={key} />
    </button>
  );
}
