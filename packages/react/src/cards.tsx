import type { CSSProperties, ReactNode } from "react";
import type { CardPileState } from "@jgengine/core/cards/cardPile";
import { DraggableCard, DropZone, type DragLayer } from "./dragLayer";

/** The four French-deck suits. */
export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

/** A playing-card rank, ace through king. */
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

/** Suits in canonical order (clubs, diamonds, hearts, spades). */
export const SUITS: readonly Suit[] = ["clubs", "diamonds", "hearts", "spades"];

/** Ranks in ascending order, ace low. */
export const RANKS: readonly Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** True for the red suits (hearts, diamonds). */
export function isRedSuit(suit: Suit): boolean {
  return suit === "hearts" || suit === "diamonds";
}

/** A single card in a stack: an id plus its face and orientation. */
export interface PlayingCard {
  id: string;
  rank: Rank;
  suit: Suit;
  faceDown?: boolean;
}

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

function SuitGlyph({ suit, size = 16 }: { suit: Suit; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      data-suit-glyph={suit}
      style={{ display: "block" }}
    >
      {SUIT_PATHS[suit]}
    </svg>
  );
}

const SUIT_LABEL: Record<Suit, string> = {
  clubs: "clubs",
  diamonds: "diamonds",
  hearts: "hearts",
  spades: "spades",
};

/** A single playing-card face: rank + suit pips, or a patterned back when `faceDown`. */
export function CardFace({
  rank,
  suit,
  faceDown = false,
  width = 64,
  height = 90,
  className,
  style,
  children,
}: {
  rank: Rank;
  suit: Suit;
  faceDown?: boolean;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const radius = Math.round(Math.min(width, height) * 0.11);
  const base: CSSProperties = {
    width,
    height,
    borderRadius: radius,
    boxSizing: "border-box",
    position: "relative",
    userSelect: "none",
    ...style,
  };
  if (faceDown) {
    return (
      <div
        className={className}
        data-card-face=""
        data-face-down=""
        role="img"
        aria-label="Face-down card"
        style={{
          ...base,
          border: "1px solid #1e2a52",
          background:
            "repeating-linear-gradient(45deg, #2b3a72 0, #2b3a72 4px, #1b2650 4px, #1b2650 8px)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: Math.round(Math.min(width, height) * 0.09),
            borderRadius: Math.max(2, radius - 3),
            border: "1px solid rgba(255,255,255,0.35)",
          }}
        />
        {children}
      </div>
    );
  }
  const color = isRedSuit(suit) ? "#c02434" : "#16181d";
  const cornerFont = Math.round(height * 0.16);
  const corner = (rotated: boolean): CSSProperties => ({
    position: "absolute",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    lineHeight: 1,
    color,
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontWeight: 700,
    fontSize: cornerFont,
    ...(rotated
      ? { right: Math.round(width * 0.06), bottom: Math.round(height * 0.05), transform: "rotate(180deg)" }
      : { left: Math.round(width * 0.06), top: Math.round(height * 0.05) }),
  });
  return (
    <div
      className={className}
      data-card-face=""
      data-rank={rank}
      data-suit={suit}
      role="img"
      aria-label={`${rank} of ${SUIT_LABEL[suit]}`}
      style={{
        ...base,
        border: "1px solid #c8ccd6",
        background: "#ffffff",
      }}
    >
      <span data-card-corner="top" style={corner(false)}>
        <span data-card-rank>{rank}</span>
        <SuitGlyph suit={suit} size={cornerFont} />
      </span>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color,
        }}
      >
        <SuitGlyph suit={suit} size={Math.round(Math.min(width, height) * 0.5)} />
      </div>
      <span data-card-corner="bottom" style={corner(true)}>
        <span data-card-rank>{rank}</span>
        <SuitGlyph suit={suit} size={cornerFont} />
      </span>
      {children}
    </div>
  );
}

/**
 * An overlapping fan of `CardFace`s. Plain-props: pass `cards`. Optional drag: pass a `layer`
 * to make each card a `DraggableCard`, and `dropId` to wrap the pile in a `DropZone`.
 */
export function StackedPile({
  cards,
  faceDown,
  offsetX = 0,
  offsetY = 20,
  cardWidth = 64,
  cardHeight = 90,
  layer,
  dropId,
  draggableFrom = 0,
  className,
  cardClassName,
  onCardClick,
  renderOverlay,
}: {
  cards: readonly PlayingCard[];
  faceDown?: boolean;
  offsetX?: number;
  offsetY?: number;
  cardWidth?: number;
  cardHeight?: number;
  layer?: DragLayer<PlayingCard>;
  dropId?: string;
  draggableFrom?: number;
  className?: string;
  cardClassName?: string;
  onCardClick?: (card: PlayingCard, index: number) => void;
  renderOverlay?: (card: PlayingCard, index: number) => ReactNode;
}) {
  const last = Math.max(0, cards.length - 1);
  const width = cardWidth + Math.abs(offsetX) * last;
  const height = cardHeight + Math.abs(offsetY) * last;
  const baseLeft = offsetX < 0 ? -offsetX * last : 0;
  const baseTop = offsetY < 0 ? -offsetY * last : 0;
  const body = (
    <div
      className={className}
      data-card-stack=""
      data-count={cards.length}
      style={{ position: "relative", width, height }}
    >
      {cards.map((card, index) => {
        const positioned: CSSProperties = {
          position: "absolute",
          left: baseLeft + offsetX * index,
          top: baseTop + offsetY * index,
          zIndex: index,
        };
        const face = (
          <CardFace
            rank={card.rank}
            suit={card.suit}
            faceDown={card.faceDown ?? faceDown}
            width={cardWidth}
            height={cardHeight}
            className={cardClassName}
          >
            {renderOverlay?.(card, index)}
          </CardFace>
        );
        const clickable = onCardClick !== undefined;
        if (layer !== undefined && index >= draggableFrom) {
          return (
            <div key={card.id} style={positioned}>
              <DraggableCard id={card.id} value={card} layer={layer} onRotate={false}>
                {face}
              </DraggableCard>
            </div>
          );
        }
        return (
          <div
            key={card.id}
            data-card-slot={index}
            style={{ ...positioned, cursor: clickable ? "pointer" : undefined }}
            onClick={clickable ? () => onCardClick(card, index) : undefined}
          >
            {face}
          </div>
        );
      })}
    </div>
  );
  if (layer !== undefined && dropId !== undefined) {
    return (
      <DropZone id={dropId} layer={layer}>
        {body}
      </DropZone>
    );
  }
  return body;
}

/**
 * `StackedPile` bound to a headless `CardPileState` zone: reads the ordered card ids from
 * `pile.zones[zone]` and resolves each to a `PlayingCard` via `cardOf`.
 */
export function CardStack({
  pile,
  zone,
  cardOf,
  ...rest
}: {
  pile: CardPileState;
  zone: string;
  cardOf: (id: string) => PlayingCard;
} & Omit<Parameters<typeof StackedPile>[0], "cards">) {
  const ids = pile.zones[zone] ?? [];
  const cards = ids.map(cardOf);
  return <StackedPile cards={cards} {...rest} />;
}
