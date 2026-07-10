import type { LegSplit } from "../../relay/state";
import { formatClock, formatDeltaSeconds } from "../../format";

export function SplitsTable({ splits }: { splits: readonly LegSplit[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-[#c9c4b8]/30 text-left text-[11px] uppercase tracking-wider text-[#c9c4b8]/80">
          <th className="py-1 pr-3 font-semibold">Leg</th>
          <th className="py-1 pr-3 font-semibold">Time</th>
          <th className="py-1 pr-3 font-semibold">Par</th>
          <th className="py-1 font-semibold">Vs par</th>
        </tr>
      </thead>
      <tbody>
        {splits.map((split) => {
          const delta = split.timeSeconds - split.parSeconds;
          const good = delta <= 0;
          return (
            <tr key={split.legId} className="border-b border-white/10 last:border-0">
              <td className="py-1.5 pr-3 text-[#f2b950]">{split.legName}</td>
              <td className="py-1.5 pr-3 font-mono tabular-nums text-[#c9c4b8]">{formatClock(split.timeSeconds)}</td>
              <td className="py-1.5 pr-3 font-mono tabular-nums text-[#c9c4b8]/70">{formatClock(split.parSeconds)}</td>
              <td className={`py-1.5 font-mono tabular-nums font-semibold ${good ? "text-[#8fae7c]" : "text-[#b3573f]"}`}>
                {formatDeltaSeconds(delta)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
