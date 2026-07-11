import type { Outcome } from "../../rules/settle";
import { shoeRemaining, shoeTotal } from "../../state/machine";
import type { TableState } from "../../state/machine";

function formatChips(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

function ChipDot() {
  return <span className="inline-block h-6 w-6 shrink-0 rounded-full border-[3px] border-dotted border-[#e0a877] bg-[#b06a3f]" />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-bold tabular-nums text-emerald-50">{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-emerald-100/50">{label}</span>
    </div>
  );
}

export function BankPanel({ state }: { state: TableState }) {
  const staked = state.hands.length > 0 ? state.hands.reduce((sum, hand) => sum + hand.bet, 0) : state.bet;
  return (
    <div className="min-w-[172px] rounded-xl border border-amber-300/20 bg-emerald-950/75 px-4 py-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ChipDot />
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-widest text-emerald-100/60">Chip Bank</span>
            <span className="text-2xl font-black tabular-nums text-amber-100">{formatChips(state.bank)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[10px] uppercase tracking-widest text-emerald-100/60">Bet</span>
          <span className="text-xl font-black tabular-nums text-amber-200">{formatChips(staked)}</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-emerald-300/10 pt-2">
        <Stat label="Streak" value={String(state.streak)} />
        <Stat label="Peak" value={formatChips(state.records.peakBank)} />
        <Stat label="Hands Won" value={String(state.records.handsWon)} />
      </div>
    </div>
  );
}

export function ShoePanel({ state }: { state: TableState }) {
  const total = shoeTotal(state);
  const remaining = shoeRemaining(state);
  const frac = total === 0 ? 0 : remaining / total;
  const penetration = Math.round((1 - frac) * 100);
  return (
    <div className="min-w-[172px] rounded-xl border border-emerald-300/15 bg-emerald-950/75 px-4 py-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-emerald-100/60">6-Deck Shoe</span>
        <span className="text-[11px] font-bold tabular-nums text-emerald-100/80">
          {remaining}/{total}
        </span>
      </div>
      <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-black/40">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-400" style={{ width: `${frac * 100}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-rose-400/80" style={{ left: "25%" }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-emerald-100/50">
        <span>Dealt {penetration}%</span>
        <span>Reshuffle at 25%</span>
      </div>
    </div>
  );
}

const DOT_COLOR: Record<Outcome, string> = {
  blackjack: "bg-amber-400",
  win: "bg-emerald-400",
  push: "bg-slate-300",
  lose: "bg-rose-500",
};

function OutcomeDot({ outcome }: { outcome: Outcome }) {
  return <span className={["h-2.5 w-2.5 rounded-full", DOT_COLOR[outcome]].join(" ")} />;
}

export function HistoryPanel({ state }: { state: TableState }) {
  return (
    <div className="flex max-h-[280px] w-[196px] flex-col rounded-xl border border-emerald-300/15 bg-emerald-950/75 px-3 py-2.5 shadow-xl backdrop-blur">
      <span className="mb-1.5 text-[10px] uppercase tracking-widest text-emerald-100/60">Last Rounds</span>
      {state.history.length === 0 ? (
        <span className="py-2 text-center text-[11px] text-emerald-100/40">No rounds played yet</span>
      ) : (
        <div className="flex flex-col gap-1 overflow-y-auto pr-1">
          {state.history.map((round) => (
            <div key={round.id} className="flex items-center justify-between rounded-lg bg-black/25 px-2 py-1 text-[11px]">
              <span className="w-12 text-emerald-100/60">Dlr {round.dealerBust ? "Bust" : round.dealerTotal}</span>
              <div className="flex gap-1">
                {round.hands.map((hand, index) => (
                  <OutcomeDot key={index} outcome={hand.outcome} />
                ))}
              </div>
              <span
                className={[
                  "w-12 text-right font-bold tabular-nums",
                  round.net > 0 ? "text-emerald-300" : round.net < 0 ? "text-rose-300" : "text-emerald-100/60",
                ].join(" ")}
              >
                {round.net > 0 ? `+${round.net}` : round.net}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
