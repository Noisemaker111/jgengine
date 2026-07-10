import { ToastStack } from "@jgengine/react/components";
import type { FeedEntry } from "@jgengine/core/game/feed";
import { GATE_SPLIT_FEED_ACTION, type GateSplitToast } from "../../race/tick";

function renderToast(entry: FeedEntry) {
  const toast = entry.data as GateSplitToast;
  return (
    <div className="rounded-sm border border-[#f2c14e]/40 bg-[#0e2a30]/90 px-3 py-1.5 text-sm text-[#e6f2ef] shadow">
      <span className="font-bold text-[#f2c14e]">{toast.gateLabel}</span>
      <span className="ml-2 tabular-nums text-[#e6f2ef]/80">{toast.splitSec.toFixed(1)}s</span>
      <span className="ml-2 text-xs uppercase tracking-wide text-[#e6f2ef]/50">Lap {toast.lap}</span>
    </div>
  );
}

export function GateToasts() {
  return (
    <ToastStack
      action={GATE_SPLIT_FEED_ACTION}
      limit={3}
      className="flex flex-col items-end gap-1.5"
      renderToast={renderToast}
    />
  );
}
