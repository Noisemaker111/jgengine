import type { Card, Suit } from "../../freecell/cards";
import { SUIT_SYMBOL, colorOf, rankLabel } from "../../freecell/cards";

export function CardFace({ card, selected = false }: { card: Card; selected?: boolean }) {
  const red = card.color === "red";
  const symbol = SUIT_SYMBOL[card.suit];
  const rank = rankLabel(card.rank);
  return (
    <div
      className={[
        "relative h-[var(--card-h)] w-[var(--card-w)] select-none rounded-[0.4rem] border bg-[linear-gradient(180deg,#ffffff_0%,#eef2f7_100%)]",
        red ? "text-rose-600" : "text-slate-900",
        selected
          ? "-translate-y-[calc(var(--card-w)*0.14)] border-sky-300 shadow-[0_0_0_2px_#7dd3fc,0_10px_18px_-6px_rgba(0,0,0,0.7)]"
          : "border-slate-300/80 shadow-[0_2px_5px_-1px_rgba(0,0,0,0.55)]",
        "transition-transform duration-100",
      ].join(" ")}
    >
      <span className="absolute left-[6%] top-[3%] text-[calc(var(--card-w)*0.36)] font-bold leading-none">{rank}</span>
      <span className="absolute left-[8%] top-[calc(var(--card-w)*0.4)] text-[calc(var(--card-w)*0.3)] leading-none">
        {symbol}
      </span>
      <span className="absolute inset-0 flex items-center justify-center text-[calc(var(--card-w)*0.66)] leading-none opacity-90">
        {symbol}
      </span>
      <span className="absolute bottom-[3%] right-[6%] rotate-180 text-[calc(var(--card-w)*0.36)] font-bold leading-none">
        {rank}
      </span>
    </div>
  );
}

export function EmptySlot({
  label,
  suit,
  highlight = false,
}: {
  label?: string;
  suit?: Suit;
  highlight?: boolean;
}) {
  const red = suit !== undefined && colorOf(suit) === "red";
  return (
    <div
      className={[
        "flex h-[var(--card-h)] w-[var(--card-w)] items-center justify-center rounded-[0.4rem] border border-dashed",
        highlight ? "border-sky-300/70 bg-sky-400/10" : "border-slate-300/25 bg-slate-100/5",
      ].join(" ")}
    >
      {suit !== undefined ? (
        <span
          className={[
            "text-[calc(var(--card-w)*0.6)] leading-none",
            red ? "text-rose-400/40" : "text-slate-300/35",
          ].join(" ")}
        >
          {SUIT_SYMBOL[suit]}
        </span>
      ) : label !== undefined ? (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400/50">{label}</span>
      ) : null}
    </div>
  );
}
