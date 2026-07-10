import { HudLabel } from "@/components/ui/hud-label";
import { HudPanel } from "@/components/ui/hud-panel";

import { FULL_REFILL_SECONDS, QUICK_TOPUP_AMOUNT, QUICK_TOPUP_SECONDS, type DockKind, type DockState } from "../../caravan/water";
import type { DockChoicePrompt } from "../../run/runState";
import { oasisNameById } from "../../world/sites";

const oasisName = oasisNameById;

export function DockPanel({
  choice,
  dock,
  onCommit,
  onCancel,
}: {
  choice: DockChoicePrompt | null;
  dock: DockState | null;
  onCommit: (kind: DockKind) => void;
  onCancel: () => void;
}) {
  if (dock !== null) {
    const fraction = Math.min(1, dock.elapsed / dock.duration);
    return (
      <HudPanel title={oasisName(dock.oasisId)} width={280}>
        <div className="flex flex-col gap-2">
          <HudLabel>{dock.kind === "full" ? "Filling deep" : "Quick top-up"}</HudLabel>
          <div className="relative h-3 w-full overflow-hidden" style={{ background: "var(--jg-surface-deep)", border: "1px solid var(--jg-edge)" }}>
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-150"
              style={{ width: `${fraction * 100}%`, background: "var(--jg-accent)" }}
            />
          </div>
          <span className="font-mono text-[11px]" style={{ color: "var(--jg-text-dim)" }}>
            {Math.ceil(dock.duration - dock.elapsed)}s remaining
          </span>
        </div>
      </HudPanel>
    );
  }

  if (choice === null) return null;

  return (
    <HudPanel title={oasisName(choice.oasisId)} width={300}>
      <div className="flex flex-col gap-3">
        <HudLabel>Water is the only true coin.</HudLabel>
        <button
          type="button"
          onClick={() => onCommit("full")}
          className="flex items-center justify-between px-3 py-2 text-left"
          style={{ background: "var(--jg-surface-deep)", border: "1px solid var(--jg-edge)", cursor: "pointer" }}
        >
          <span className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--jg-text)" }}>
            Full Refill
          </span>
          <span className="font-mono text-[11px]" style={{ color: "var(--jg-accent)" }}>
            {FULL_REFILL_SECONDS}s · full skins
          </span>
        </button>
        <button
          type="button"
          onClick={() => onCommit("quick")}
          className="flex items-center justify-between px-3 py-2 text-left"
          style={{ background: "var(--jg-surface-deep)", border: "1px solid var(--jg-edge)", cursor: "pointer" }}
        >
          <span className="text-[13px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--jg-text)" }}>
            Quick Top-Up
          </span>
          <span className="font-mono text-[11px]" style={{ color: "var(--jg-accent)" }}>
            {QUICK_TOPUP_SECONDS}s · +{QUICK_TOPUP_AMOUNT}
          </span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] uppercase tracking-[0.16em]"
          style={{ color: "var(--jg-text-dim)", background: "transparent", border: "none", cursor: "pointer" }}
        >
          Ride on without drinking
        </button>
      </div>
    </HudPanel>
  );
}
