import { formatDuration } from "@jgengine/core/format/duration";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { KeyHint } from "@jgengine/react";

import { keybinds } from "../../keybinds";
import { PART_SLOTS } from "../../parts/catalog";
import type { SessionSnapshot } from "../../run/session";
import { PartIcon } from "./PartIcon";

interface CrushedScreenProps {
  snapshot: SessionSnapshot;
  onRestart: () => void;
}

export function CrushedScreen({ snapshot, onRestart }: CrushedScreenProps) {
  const outcome = snapshot.outcome;
  if (outcome === null) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#1c1a17]/95 p-4">
      <div className="w-full max-w-lg rounded-lg border-2 border-[#ff3b30] bg-[#241f19] p-6 text-center shadow-[0_0_50px_rgba(255,59,48,0.3)]">
        <p className="text-xs font-black tracking-[0.3em] text-[#ff3b30]">ROW SIX GOT YOU</p>
        <h2 className="mt-1 text-4xl font-black text-[#fef3e0]">CRUSHED</h2>
        <p className="mt-2 text-sm text-[#c9b8a4]">Caught in {outcome.zoneLabel.toLowerCase()} after {formatDuration(outcome.time, { decimals: 1 })}.</p>

        <div className="mt-5 flex justify-center gap-2">
          {PART_SLOTS.map((slot) => (
            <div key={slot} className="flex h-11 w-11 items-center justify-center rounded border border-[#8d99a6]/50 bg-[#1c1a17]">
              <PartIcon partId={snapshot.installed[slot]?.id ?? null} className="h-8 w-8" />
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-[#8d99a6]">Your build: {outcome.partsOnExit}/4 slots bolted.</p>

        <button
          type="button"
          onClick={onRestart}
          className="mt-6 rounded border-2 border-[#ff3b30] bg-[#b7410e] px-8 py-3 text-lg font-black tracking-widest text-[#fef3e0] transition hover:bg-[#d94f14]"
        >
          RESTART
          <KeyHint> — {actionLabel(keybinds, "restart") ?? "R"}</KeyHint>
        </button>
      </div>
    </div>
  );
}
