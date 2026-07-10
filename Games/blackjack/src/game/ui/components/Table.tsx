import type { ReactNode } from "react";

import { handTotal, isBlackjack, totalLabel } from "../../rules/scoring";
import type { HandState, Phase } from "../../state/machine";
import { CardBack, CardView, OutcomeBadge, TotalPill, type CardSize } from "./Card";

function FannedCards({ children }: { children: ReactNode[] }) {
  return (
    <div className="flex">
      {children.map((card, index) => (
        <div key={index} className={index === 0 ? "" : "-ml-3"} style={{ zIndex: index }}>
          {card}
        </div>
      ))}
    </div>
  );
}

export function DealerArea({
  dealer,
  holeShown,
  size,
}: {
  dealer: HandState["cards"];
  holeShown: boolean;
  size: CardSize;
}) {
  const revealed = holeShown || dealer.length === 0;
  const total = handTotal(dealer);
  const upTotal = dealer.length > 0 ? handTotal([dealer[0]]).total : 0;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100/70">Dealer</span>
        {dealer.length === 0 ? null : revealed ? (
          <TotalPill text={totalLabel(total)} tone={total.total > 21 ? "bust" : isBlackjack(dealer) ? "blackjack" : "live"} />
        ) : (
          <TotalPill text={`Shows ${upTotal}`} tone="muted" />
        )}
      </div>
      {dealer.length === 0 ? (
        <div className="flex gap-1">
          <div className="h-[94px] w-[66px] rounded-lg border border-dashed border-emerald-200/25" />
          <div className="h-[94px] w-[66px] rounded-lg border border-dashed border-emerald-200/25" />
        </div>
      ) : (
        <FannedCards>
          {dealer.map((card, index) =>
            !revealed && index === 1 ? <CardBack key="hole" size={size} /> : <CardView key={index} card={card} size={size} animate />,
          )}
        </FannedCards>
      )}
    </div>
  );
}

function PlayerHand({
  hand,
  index,
  active,
  showLabel,
  size,
}: {
  hand: HandState;
  index: number;
  active: boolean;
  showLabel: boolean;
  size: CardSize;
}) {
  const total = handTotal(hand.cards);
  const natural = !hand.fromSplit && isBlackjack(hand.cards);
  const tone = total.total > 21 ? "bust" : natural ? "blackjack" : "live";
  const label = natural ? "Blackjack" : totalLabel(total);
  return (
    <div
      className={[
        "flex flex-col items-center gap-2 rounded-2xl p-2 transition-all",
        active ? "bg-amber-300/10 ring-2 ring-amber-300 shadow-[0_0_20px_rgba(252,211,77,0.25)]" : "ring-1 ring-transparent",
      ].join(" ")}
    >
      <FannedCards>
        {hand.cards.map((card, cardIndex) => (
          <CardView key={cardIndex} card={card} size={size} animate />
        ))}
      </FannedCards>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {active ? <span className="text-amber-300">▶</span> : null}
        {showLabel ? <span className="text-[11px] font-semibold text-emerald-100/60">H{index + 1}</span> : null}
        <TotalPill text={label} tone={tone} />
        <span className="rounded-full bg-[#b8622f] px-2 py-0.5 text-[11px] font-bold text-amber-50 shadow">
          {hand.bet}
          {hand.doubled ? " ×2" : ""}
        </span>
        {hand.outcome !== null ? <OutcomeBadge outcome={hand.outcome} /> : null}
      </div>
    </div>
  );
}

export function PlayerArea({
  hands,
  activeHand,
  phase,
  size,
}: {
  hands: HandState[];
  activeHand: number;
  phase: Phase;
  size: CardSize;
}) {
  if (hands.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100/70">You</span>
        <div className="flex gap-1">
          <div className="h-[94px] w-[66px] rounded-lg border border-dashed border-emerald-200/25" />
          <div className="h-[94px] w-[66px] rounded-lg border border-dashed border-emerald-200/25" />
        </div>
        <span className="text-[11px] text-emerald-100/50">Place a bet to deal</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100/70">You</span>
      <div className="flex flex-wrap items-end justify-center gap-3">
        {hands.map((hand, index) => (
          <PlayerHand
            key={index}
            hand={hand}
            index={index}
            active={phase === "player" && index === activeHand}
            showLabel={hands.length > 1}
            size={size}
          />
        ))}
      </div>
    </div>
  );
}
