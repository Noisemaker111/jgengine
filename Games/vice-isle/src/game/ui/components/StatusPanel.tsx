import { HealthBar, ShieldBar, barTokens } from "@jgengine/react/bars";
import { useCurrency, useEntityStat, usePlayer } from "@jgengine/react/hooks";
import type { CSSProperties, ReactNode } from "react";

import { MAX_CRED } from "../../progression/cred";

// The Vice-Isle skin as shared vitals tokens (#1033): a thin skewed trough on the cream plate.
// The label/value sit outside the bar (the game owns that layout); the atomic bar is just the trough.
const STATUS_TOKENS: CSSProperties = {
  ...barTokens({
    health: "#3fbf5a",
    shield: "#4fa5e8",
    track: "#12141a",
    frame: "#000000",
    frameWidth: "2px",
    height: "12px",
    radius: "0px",
    bevel: "none",
  }),
};

function StatRow({ label, value, children }: { label: string; value: number; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-7 text-[10px] font-black uppercase tracking-widest text-black/70">{label}</span>
      <div style={{ width: 144 }}>{children}</div>
      <span className="text-xs font-black tabular-nums">{Math.round(value)}</span>
    </div>
  );
}

export function StatusPanel() {
  const { userId } = usePlayer();
  const health = useEntityStat(userId, "health");
  const armor = useEntityStat(userId, "armor");
  const xp = useEntityStat(userId, "xp");
  const level = useEntityStat(userId, "level");
  const cash = useCurrency("cash");
  const cred = level?.current ?? 1;
  const credFraction = cred >= MAX_CRED ? 1 : (xp?.max ?? 0) > 0 ? Math.min(1, (xp?.current ?? 0) / (xp?.max ?? 1)) : 0;
  return (
    <div
      className="flex flex-col gap-1 rounded-sm border-2 border-black bg-[#f4e8c8] px-3 py-2 text-[#1b1e26] shadow-[4px_4px_0_#000]"
      style={STATUS_TOKENS}
    >
      <StatRow label="HP" value={health?.current ?? 0}>
        <HealthBar value={health?.current ?? 0} max={health?.max ?? 100} shape="skew" showValue={false} width="100%" />
      </StatRow>
      <StatRow label="AR" value={armor?.current ?? 0}>
        <ShieldBar value={armor?.current ?? 0} max={armor?.max ?? 100} shape="skew" showValue={false} width="100%" />
      </StatRow>
      <div className="mt-0.5 flex items-center gap-2">
        <div className="-skew-x-6 border-2 border-black bg-[#2f8f4e] px-2 py-0.5 text-sm font-black text-[#eaffdd]">
          ${cash.toLocaleString()}
        </div>
        <div className="flex items-center gap-1.5 -skew-x-6 border-2 border-black bg-[#6d2f8f] px-2 py-0.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-white">Cred {cred}</span>
          <div className="h-1.5 w-10 border border-black bg-[#12141a]">
            <div className="h-full bg-[#e8a5ff]" style={{ width: `${credFraction * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
