import type { CSSProperties } from "react";

import type { Card } from "../../cards";
import { RANK_LABEL, SUIT_GLYPH, suitIsRed } from "../../cards";

const CARD_BACK: CSSProperties = {
  backgroundColor: "#7a1717",
  backgroundImage:
    "repeating-linear-gradient(45deg, rgba(201,162,39,0.35) 0, rgba(201,162,39,0.35) 3px, transparent 3px, transparent 9px)",
  boxShadow: "inset 0 0 0 3px rgba(201,162,39,0.55)",
};

export interface CardFaceProps {
  card?: Card;
  held: boolean;
  faceDown: boolean;
  interactive: boolean;
  compact: boolean;
  onClick: () => void;
}

export function CardFace({ card, held, faceDown, interactive, compact, onClick }: CardFaceProps) {
  const showFace = !faceDown && card !== undefined;
  const red = showFace && suitIsRed(card.suit);
  const inkClass = red ? "text-[#c8102e]" : "text-stone-900";
  const sizeClass = compact ? "h-24 w-[3.9rem]" : "h-36 w-[5.75rem]";
  const cornerSize = compact ? "text-base" : "text-2xl";
  const pipStyle: CSSProperties = { fontSize: compact ? "2rem" : "3.1rem", lineHeight: 1 };

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={[
          "text-[0.6rem] font-black uppercase tracking-[0.2em]",
          held ? "text-amber-300 drop-shadow-[0_0_4px_rgba(251,191,36,0.9)]" : "text-transparent",
        ].join(" ")}
      >
        Held
      </span>
      <button
        type="button"
        onClick={onClick}
        disabled={!interactive}
        aria-pressed={held}
        aria-label={showFace && card !== undefined ? `${RANK_LABEL[card.rank]} of ${card.suit}` : "face-down card"}
        className={[
          "relative rounded-lg border-2 transition-transform duration-150 outline-none",
          sizeClass,
          showFace ? "bg-gradient-to-b from-white to-stone-200" : "",
          held
            ? "-translate-y-1.5 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.85)]"
            : "border-stone-400/80 shadow-[0_6px_14px_rgba(0,0,0,0.55)]",
          interactive ? "cursor-pointer hover:-translate-y-1 focus-visible:-translate-y-1" : "cursor-default",
        ].join(" ")}
        style={showFace ? undefined : CARD_BACK}
      >
        {showFace && card !== undefined ? (
          <>
            <span
              className={`absolute left-1.5 top-1 flex flex-col items-center font-black leading-none ${cornerSize} ${inkClass}`}
            >
              <span>{RANK_LABEL[card.rank]}</span>
              <span className="text-[0.7em]">{SUIT_GLYPH[card.suit]}</span>
            </span>
            <span className={`absolute inset-0 flex items-center justify-center ${inkClass}`} style={pipStyle}>
              {SUIT_GLYPH[card.suit]}
            </span>
            <span
              className={`absolute bottom-1 right-1.5 flex rotate-180 flex-col items-center font-black leading-none ${cornerSize} ${inkClass}`}
            >
              <span>{RANK_LABEL[card.rank]}</span>
              <span className="text-[0.7em]">{SUIT_GLYPH[card.suit]}</span>
            </span>
          </>
        ) : null}
      </button>
    </div>
  );
}
