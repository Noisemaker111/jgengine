import { GameIcon, type GameIconName } from "@jgengine/react/gameIcons";

import { GLYPH_TITLES } from "../../match/catalog";
import type { CardFace } from "../../match/machine";
import { CardBackFiligree } from "./CardBackFiligree";

export function CardTile({
  index,
  glyph,
  face,
  shaking,
  disabled,
  onFlip,
}: {
  index: number;
  glyph: GameIconName;
  face: CardFace;
  shaking: boolean;
  disabled: boolean;
  onFlip: (index: number) => void;
}) {
  const revealed = face !== "down";
  const title = GLYPH_TITLES[glyph] ?? glyph;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onFlip(index)}
      aria-label={revealed ? `Card ${index + 1}: ${title}` : `Card ${index + 1}, face down`}
      className={`mm-perspective relative aspect-[3/4] w-full rounded-[10%/7.5%] outline-none focus-visible:ring-2 focus-visible:ring-[#e3c883] ${
        shaking ? "mm-shake" : ""
      } ${disabled ? "" : "cursor-pointer"}`}
    >
      <div
        className={`mm-card-inner relative h-full w-full ${revealed ? "mm-flipped" : ""} ${
          face === "matched" ? "mm-matched" : ""
        }`}
      >
        <div className="mm-card-face shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
          <CardBackFiligree />
        </div>
        <div
          className={`mm-card-face mm-card-front flex items-center justify-center bg-gradient-to-b from-[#f6efdf] to-[#eadfc4] shadow-[0_2px_6px_rgba(0,0,0,0.45)] ${
            face === "matched" ? "mm-matched-glow" : "shadow-[inset_0_0_0_1.5px_rgba(201,165,87,0.6)]"
          }`}
        >
          <div className={`h-[52%] w-[52%] ${face === "matched" ? "text-[#a8842e]" : "text-[#22375c]"}`}>
            <GameIcon name={glyph} className="h-full w-full" />
          </div>
        </div>
      </div>
    </button>
  );
}
