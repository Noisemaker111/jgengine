import { isRed } from "../../rules/deck";
import type { Card, Suit } from "../../rules/deck";
import type { Outcome } from "../../rules/settle";

export type CardSize = "md" | "sm";

const DIMS: Record<CardSize, string> = {
  md: "h-[94px] w-[66px]",
  sm: "h-[66px] w-[46px]",
};

const HEART = "M50 84 C 20 62 8 44 8 28 C 8 15 20 9 30 13 C 38 16 46 24 50 33 C 54 24 62 16 70 13 C 80 9 92 15 92 28 C 92 44 80 62 50 84 Z";
const DIAMOND = "M50 6 L88 50 L50 94 L12 50 Z";
const SPADE =
  "M50 8 C 50 8 90 38 90 62 C 90 76 79 84 68 81 C 62 79 58 74 57 69 C 57 78 61 86 70 92 L30 92 C 39 86 43 78 43 69 C 42 74 38 79 32 81 C 21 84 10 76 10 62 C 10 38 50 8 50 8 Z";

export function Pip({ suit, className }: { suit: Suit; className?: string }) {
  const color = isRed(suit) ? "#c0392b" : "#1b1b24";
  if (suit === "C") {
    return (
      <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
        <g fill={color}>
          <circle cx="50" cy="30" r="17" />
          <circle cx="29" cy="60" r="17" />
          <circle cx="71" cy="60" r="17" />
          <path d="M42 58 L58 58 L64 92 L36 92 Z" />
        </g>
      </svg>
    );
  }
  const path = suit === "H" ? HEART : suit === "D" ? DIAMOND : SPADE;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d={path} fill={color} />
    </svg>
  );
}

export function CardView({ card, size, animate }: { card: Card; size: CardSize; animate?: boolean }) {
  const rankColor = isRed(card.suit) ? "text-[#c0392b]" : "text-[#1b1b24]";
  const rankSize = size === "md" ? "text-xl" : "text-sm";
  const corner = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";
  const center = size === "md" ? "h-8 w-8" : "h-6 w-6";
  const index = (
    <div className={["flex flex-col items-center leading-none", rankColor].join(" ")}>
      <span className={["font-black tracking-tighter", rankSize].join(" ")}>{card.rank}</span>
      <Pip suit={card.suit} className={corner} />
    </div>
  );
  return (
    <div
      className={[
        "relative shrink-0 rounded-lg border border-[#d8cbaa] bg-[#f6efdd] shadow-[0_6px_14px_rgba(0,0,0,0.35)]",
        DIMS[size],
        animate === true ? "card-deal" : "",
      ].join(" ")}
    >
      <div className="absolute left-1.5 top-1.5">{index}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <Pip suit={card.suit} className={center} />
      </div>
      <div className="absolute bottom-1.5 right-1.5 rotate-180">{index}</div>
    </div>
  );
}

export function CardBack({ size }: { size: CardSize }) {
  return (
    <div
      className={[
        "shrink-0 rounded-lg border border-[#4c1a1a] bg-[#8f3a2f] p-1.5 shadow-[0_6px_14px_rgba(0,0,0,0.35)]",
        DIMS[size],
      ].join(" ")}
    >
      <div className="h-full w-full rounded-[4px] border border-[#e6b98a]/40 bg-[repeating-linear-gradient(45deg,#7a2f26_0_7px,#98453a_7px_14px)]" />
    </div>
  );
}

const OUTCOME_STYLE: Record<Outcome, { label: string; className: string }> = {
  blackjack: { label: "Blackjack", className: "bg-amber-400 text-amber-950" },
  win: { label: "Win", className: "bg-emerald-400 text-emerald-950" },
  push: { label: "Push", className: "bg-slate-300 text-slate-900" },
  lose: { label: "Lose", className: "bg-rose-500 text-rose-50" },
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const style = OUTCOME_STYLE[outcome];
  return (
    <span className={["rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide shadow", style.className].join(" ")}>
      {style.label}
    </span>
  );
}

export function TotalPill({ text, tone }: { text: string; tone: "live" | "bust" | "blackjack" | "muted" }) {
  const toneClass =
    tone === "bust"
      ? "bg-rose-600/90 text-rose-50"
      : tone === "blackjack"
        ? "bg-amber-400/95 text-amber-950"
        : tone === "muted"
          ? "bg-black/45 text-emerald-50/80"
          : "bg-black/55 text-emerald-50";
  return <span className={["rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums shadow", toneClass].join(" ")}>{text}</span>;
}
