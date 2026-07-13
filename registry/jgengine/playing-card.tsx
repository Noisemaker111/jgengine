import type { ReactNode } from "react";

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

const SUIT_PATHS: Record<Suit, ReactNode> = {
  hearts: <path d="M12 21C7 17 3 13.5 3 9.5A4.5 4.5 0 0112 7a4.5 4.5 0 019 2.5C21 13.5 17 17 12 21z" />,
  diamonds: <path d="M12 2l7.5 10L12 22 4.5 12z" />,
  spades: (
    <path d="M12 2C8.5 6 3.5 8.5 3.5 13A4 4 0 0011 15.7C10.7 18 9.7 19.3 8 21h8c-1.7-1.7-2.7-3-3-5.3A4 4 0 0020.5 13C20.5 8.5 15.5 6 12 2z" />
  ),
  clubs: (
    <path d="M12 2a3.6 3.6 0 00-2.9 5.7A3.6 3.6 0 108.4 14.6 3.6 3.6 0 0011 15.3C10.8 18 9.8 19.4 8 21h8c-1.8-1.6-2.8-3-3-5.7a3.6 3.6 0 102.6-6.9A3.6 3.6 0 0012 2z" />
  ),
};

const SUIT_LABEL: Record<Suit, string> = { clubs: "clubs", diamonds: "diamonds", hearts: "hearts", spades: "spades" };

const isRed = (suit: Suit) => suit === "hearts" || suit === "diamonds";

function SuitGlyph({ suit, size }: { suit: Suit; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" className="block">
      {SUIT_PATHS[suit]}
    </svg>
  );
}

export function PlayingCard({
  rank,
  suit,
  faceDown = false,
  width = 64,
  height = 90,
  className,
  children,
}: {
  rank: Rank;
  suit: Suit;
  faceDown?: boolean;
  width?: number;
  height?: number;
  className?: string;
  children?: ReactNode;
}) {
  const radius = Math.round(Math.min(width, height) * 0.11);
  if (faceDown) {
    return (
      <div
        className={`relative box-border select-none ${className ?? ""}`}
        data-jg="playing-card"
        data-face-down=""
        role="img"
        aria-label="Face-down card"
        style={{
          width,
          height,
          borderRadius: radius,
          border: "1px solid var(--jg-card-back-edge)",
          background:
            "repeating-linear-gradient(45deg, var(--jg-card-back) 0, var(--jg-card-back) 4px, var(--jg-card-back-deep) 4px, var(--jg-card-back-deep) 8px)",
        }}
      >
        <span
          className="absolute rounded-[3px]"
          style={{ inset: Math.round(Math.min(width, height) * 0.09), border: "1px solid rgba(255,255,255,0.35)" }}
        />
        {children}
      </div>
    );
  }
  const color = isRed(suit) ? "var(--jg-card-red)" : "var(--jg-card-black)";
  const cornerFont = Math.round(height * 0.16);
  return (
    <div
      className={`relative box-border select-none ${className ?? ""}`}
      data-jg="playing-card"
      data-rank={rank}
      data-suit={suit}
      role="img"
      aria-label={`${rank} of ${SUIT_LABEL[suit]}`}
      style={{
        width,
        height,
        borderRadius: radius,
        border: "1px solid var(--jg-card-edge)",
        background: "var(--jg-card-face)",
        fontFamily: "var(--jg-font-card)",
      }}
    >
      <span
        className="absolute flex flex-col items-center font-bold leading-none"
        style={{ left: Math.round(width * 0.06), top: Math.round(height * 0.05), color, fontSize: cornerFont }}
      >
        <span>{rank}</span>
        <SuitGlyph suit={suit} size={cornerFont} />
      </span>
      <span className="absolute inset-0 flex items-center justify-center" style={{ color }}>
        <SuitGlyph suit={suit} size={Math.round(Math.min(width, height) * 0.5)} />
      </span>
      <span
        className="absolute flex rotate-180 flex-col items-center font-bold leading-none"
        style={{ right: Math.round(width * 0.06), bottom: Math.round(height * 0.05), color, fontSize: cornerFont }}
      >
        <span>{rank}</span>
        <SuitGlyph suit={suit} size={cornerFont} />
      </span>
      {children}
    </div>
  );
}

export function PlayingCardStack({
  cards,
  offsetY = 20,
  offsetX = 0,
  cardWidth = 64,
  cardHeight = 90,
  className,
}: {
  cards: readonly { id: string; rank: Rank; suit: Suit; faceDown?: boolean }[];
  offsetY?: number;
  offsetX?: number;
  cardWidth?: number;
  cardHeight?: number;
  className?: string;
}) {
  const last = Math.max(0, cards.length - 1);
  return (
    <div
      className={`relative ${className ?? ""}`}
      data-jg="playing-card-stack"
      style={{ width: cardWidth + Math.abs(offsetX) * last, height: cardHeight + Math.abs(offsetY) * last }}
    >
      {cards.map((card, index) => (
        <span
          key={card.id}
          className="absolute"
          style={{
            left: (offsetX < 0 ? -offsetX * last : 0) + offsetX * index,
            top: (offsetY < 0 ? -offsetY * last : 0) + offsetY * index,
            zIndex: index,
          }}
        >
          <PlayingCard rank={card.rank} suit={card.suit} faceDown={card.faceDown} width={cardWidth} height={cardHeight} />
        </span>
      ))}
    </div>
  );
}
