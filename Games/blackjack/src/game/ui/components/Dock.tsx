import {
  canDeal,
  canDouble,
  canSplit,
  CHIP_DENOMS,
  MAX_BET,
  MIN_BET,
} from "../../state/machine";
import type { TableState } from "../../state/machine";
import { actionLabel } from "../../rules/strategy";
import type { Action } from "../../rules/strategy";
import { BetCircle, Chip } from "./Chips";

export type Run = (name: string, input?: unknown) => void;

function TableButton({
  label,
  hotkey,
  onClick,
  disabled,
  variant = "action",
  recommended = false,
}: {
  label: string;
  hotkey?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "action";
  recommended?: boolean;
}) {
  const isDisabled = disabled === true;
  const variantClass = isDisabled
    ? "cursor-not-allowed bg-black/30 text-emerald-100/30"
    : variant === "primary"
      ? "cursor-pointer bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-lg hover:brightness-110 active:translate-y-px"
      : "cursor-pointer bg-emerald-800/80 text-emerald-50 ring-1 ring-emerald-300/30 shadow hover:bg-emerald-700 active:translate-y-px";
  const rec = recommended && !isDisabled ? "ring-2 ring-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.45)]" : "";
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={["relative flex h-12 min-w-[80px] items-center justify-center rounded-xl px-4 text-sm font-bold transition-all", variantClass, rec].join(" ")}
    >
      {label}
      {hotkey !== undefined ? (
        <span className="absolute -right-1.5 -top-1.5 rounded bg-black/70 px-1 text-[9px] font-bold text-emerald-100/80">{hotkey}</span>
      ) : null}
    </button>
  );
}

function Betting({ state, run }: { state: TableState; run: Run }) {
  const cap = Math.min(MAX_BET, state.bank);
  const atCap = state.bet >= cap;
  if (state.bank < MIN_BET) {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm text-emerald-100/70">Out of chips.</span>
        <TableButton label="Rebuy 1,000 Chips" hotkey="R" variant="primary" onClick={() => run("rebuy")} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-3">
        <BetCircle bet={state.bet} />
        <div className="flex gap-2">
          {CHIP_DENOMS.map((value, index) => (
            <Chip key={value} value={value} disabled={atCap} onClick={() => run(`chip${index + 1}`)} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <TableButton label="Clear" hotkey="⌫" onClick={() => run("clearBet")} disabled={state.bet === 0} />
        <TableButton label="Deal" hotkey="Spc" variant="primary" onClick={() => run("deal")} disabled={!canDeal(state)} />
        <span className="text-[11px] text-emerald-100/50">Min {MIN_BET} · Max {MAX_BET}</span>
      </div>
    </div>
  );
}

function Insurance({ state, run }: { state: TableState; run: Run }) {
  const cost = Math.floor((state.hands[0]?.bet ?? 0) / 2);
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-sm font-semibold text-amber-100">Dealer shows an Ace — take insurance?</span>
      <span className="text-[11px] text-emerald-100/60">Costs {cost} · pays 2:1 if the dealer has blackjack</span>
      <div className="flex gap-2">
        <TableButton label={`Insure (${cost})`} hotkey="Y" variant="primary" onClick={() => run("insureYes")} disabled={state.bank < cost || cost <= 0} />
        <TableButton label="No" hotkey="N" onClick={() => run("insureNo")} />
      </div>
    </div>
  );
}

function PlayerControls({ state, run }: { state: TableState; run: Run }) {
  const dbl = canDouble(state);
  const spl = canSplit(state);
  const hint = state.hint;
  const rec = (action: Action): boolean => hint === action;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <TableButton label="Hit" hotkey="H" onClick={() => run("hit")} recommended={rec("hit")} />
        <TableButton label="Stand" hotkey="S" onClick={() => run("stand")} recommended={rec("stand")} />
        <TableButton label="Double" hotkey="D" onClick={() => run("double")} disabled={!dbl} recommended={dbl && rec("double")} />
        <TableButton label="Split" hotkey="P" onClick={() => run("split")} disabled={!spl} recommended={spl && rec("split")} />
        <TableButton label="Hint" hotkey="C" onClick={() => run("hint")} />
      </div>
      {hint !== null ? (
        <span className="rounded-full bg-amber-300/15 px-3 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-300/40">
          Basic strategy: {actionLabel(hint)}
        </span>
      ) : null}
    </div>
  );
}

function Settle({ state, run }: { state: TableState; run: Run }) {
  const last = state.history[0];
  const net = last?.net ?? 0;
  const tone = net > 0 ? "text-emerald-300" : net < 0 ? "text-rose-300" : "text-emerald-100/70";
  const text = net > 0 ? `You won ${net} chips` : net < 0 ? `You lost ${-net} chips` : "Push — bet returned";
  return (
    <div className="flex flex-col items-center gap-2">
      <span className={["text-sm font-black", tone].join(" ")}>{text}</span>
      <div className="flex gap-2">
        {state.bank < MIN_BET ? (
          <TableButton label="Rebuy 1,000" hotkey="R" onClick={() => run("rebuy")} />
        ) : null}
        <TableButton label="Next Round" hotkey="↵" variant="primary" onClick={() => run("newRound")} />
      </div>
    </div>
  );
}

export function Dock({ state, run }: { state: TableState; run: Run }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-emerald-300/15 bg-emerald-950/70 px-5 py-3 shadow-2xl backdrop-blur">
      {state.phase === "betting" ? <Betting state={state} run={run} /> : null}
      {state.phase === "insurance" ? <Insurance state={state} run={run} /> : null}
      {state.phase === "player" ? <PlayerControls state={state} run={run} /> : null}
      {state.phase === "dealer" ? <span className="py-3 text-sm font-semibold text-emerald-100/70">Dealer is drawing…</span> : null}
      {state.phase === "settle" ? <Settle state={state} run={run} /> : null}
      <div className="mt-0.5 text-center text-[10px] uppercase tracking-[0.28em] text-emerald-100/40">Traditional Twenty-One</div>
    </div>
  );
}
