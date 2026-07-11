import type { CSSProperties } from "react";

import type { Tile } from "../../logic/board";
import { fontClassFor, styleFor } from "../../tiles";

const BOARD_STYLE = {
  position: "relative",
  width: "100%",
  aspectRatio: "1",
  borderRadius: "15px",
  background: "linear-gradient(160deg, #bf9f75 0%, #a9895f 100%)",
  boxShadow: "0 12px 34px rgba(90,55,20,0.28), inset 0 2px 6px rgba(255,255,255,0.14)",
  touchAction: "none",
  "--gap": "clamp(7px, 2.3vw, 12px)",
} as CSSProperties;

const CELLS_STYLE: CSSProperties = {
  position: "absolute",
  inset: "var(--gap)",
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gridTemplateRows: "repeat(4, 1fr)",
  gap: "var(--gap)",
};

const CELL_STYLE: CSSProperties = {
  borderRadius: "9px",
  background: "rgba(255,247,230,0.32)",
  boxShadow: "inset 0 1px 2px rgba(90,55,20,0.12)",
};

const TILES_STYLE: CSSProperties = {
  position: "absolute",
  inset: "var(--gap)",
};

const TILE_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "calc((100% - 3 * var(--gap)) / 4)",
  height: "calc((100% - 3 * var(--gap)) / 4)",
  transition: "transform 120ms cubic-bezier(0.2, 0.7, 0.3, 1)",
  willChange: "transform",
};

const FONT_SIZE: Record<"lg" | "md" | "sm" | "xs", string> = {
  lg: "clamp(1.5rem, 7.2vw, 2.5rem)",
  md: "clamp(1.25rem, 6vw, 2.05rem)",
  sm: "clamp(1rem, 4.8vw, 1.65rem)",
  xs: "clamp(0.8rem, 3.7vw, 1.3rem)",
};

function TileView({ tile }: { tile: Tile }) {
  const style = styleFor(tile.value);
  const glow = style.glow !== "none" ? `${style.glow}, ` : "";
  const animation = tile.merged
    ? "s2048-pop-merge 170ms ease"
    : tile.isNew
      ? "s2048-pop-in 150ms ease"
      : undefined;
  const innerStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    borderRadius: "9px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    lineHeight: 1,
    background: style.bg,
    color: style.fg,
    boxShadow: `${glow}inset 0 2px 3px rgba(255,255,255,0.3), inset 0 -3px 5px rgba(90,45,15,0.22)`,
    fontSize: FONT_SIZE[fontClassFor(tile.value)],
    animation,
  };
  return (
    <div
      style={{
        ...TILE_STYLE,
        transform: `translate(calc(${tile.col} * (100% + var(--gap))), calc(${tile.row} * (100% + var(--gap))))`,
      }}
    >
      <div key={tile.anim} style={innerStyle}>
        {tile.value}
      </div>
    </div>
  );
}

export function Board({ tiles }: { tiles: readonly Tile[] }) {
  return (
    <div style={BOARD_STYLE}>
      <div style={CELLS_STYLE}>
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} style={CELL_STYLE} />
        ))}
      </div>
      <div style={TILES_STYLE}>
        {tiles.map((tile) => (
          <TileView key={tile.id} tile={tile} />
        ))}
      </div>
    </div>
  );
}
