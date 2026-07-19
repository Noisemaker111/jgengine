import { formatDistance } from "@jgengine/core/format/distance";
import { formatDuration } from "@jgengine/core/format/duration";
import { actionLabel } from "@jgengine/core/input/actionBindings";
import { KeyHint } from "@jgengine/react";

import { keybinds } from "../../keybinds";
import { PART_SLOTS } from "../../parts/catalog";
import type { SessionSnapshot } from "../../run/session";
import { PartIcon } from "./PartIcon";

interface WinScreenProps {
  snapshot: SessionSnapshot;
  onRestart: () => void;
}

export function WinScreen({ snapshot, onRestart }: WinScreenProps) {
  const outcome = snapshot.outcome;
  if (outcome === null) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#1c1a17]/92 p-4">
      <div className="w-full max-w-lg rounded-lg border-2 border-[#f0c419] bg-[#241f19] p-6 text-center shadow-[0_0_50px_rgba(240,196,25,0.25)]">
        <p className="text-xs font-black tracking-[0.3em] text-[#f0c419]">SHE'S UGLY BUT SHE'S FAST</p>
        <h2 className="mt-1 text-4xl font-black text-[#fef3e0]">OUT OF THE YARD</h2>

        <div className="mt-5 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
          <Stat label="TIME" value={formatDuration(outcome.time, { decimals: 1 })} />
          <Stat label="PARTS ON EXIT" value={`${outcome.partsOnExit}/4`} />
          <Stat label="NEAR MISSES" value={`${outcome.nearMisses}`} />
          <Stat label="CLOSEST CALL" value={formatDistance(outcome.closestGap)} />
        </div>

        <div className="mt-5 flex justify-center gap-2">
          {PART_SLOTS.map((slot) => (
            <div key={slot} className="flex h-11 w-11 items-center justify-center rounded border border-[#8d99a6]/50 bg-[#1c1a17]">
              <PartIcon partId={snapshot.installed[slot]?.id ?? null} className="h-8 w-8" />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onRestart}
          className="mt-6 rounded border-2 border-[#f0c419] bg-[#b7410e] px-8 py-3 text-lg font-black tracking-widest text-[#fef3e0] transition hover:bg-[#d94f14]"
        >
          RUN IT AGAIN
          <KeyHint> — {actionLabel(keybinds, "restart") ?? "R"}</KeyHint>
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#8d99a6]/40 bg-[#1c1a17] px-3 py-2">
      <p className="text-[10px] font-black tracking-[0.15em] text-[#8d99a6]">{label}</p>
      <p className="text-lg font-black text-[#fef3e0]">{value}</p>
    </div>
  );
}
