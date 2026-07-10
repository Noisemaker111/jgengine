import type { CSSProperties } from "react";

import type { Tile } from "../../logic/board";
import { fontClassFor, styleFor } from "../../tiles";

function vars(record: Record<string, string | number>): CSSProperties {
  return record as CSSProperties;
}

function TileView({ tile }: { tile: Tile }) {
  const style = styleFor(tile.value);
  const classes = ["s2048__tile-inner", `s2048__tile-inner--${fontClassFor(tile.value)}`];
  if (tile.merged) classes.push("s2048__tile-inner--merged");
  if (tile.isNew) classes.push("s2048__tile-inner--new");
  return (
    <div className="s2048__tile" style={vars({ "--col": tile.col, "--row": tile.row })}>
      <div
        key={tile.anim}
        className={classes.join(" ")}
        style={vars({ "--bg": style.bg, "--fg": style.fg, "--glow": style.glow })}
      >
        {tile.value}
      </div>
    </div>
  );
}

export function Board({ tiles }: { tiles: readonly Tile[] }) {
  return (
    <div className="s2048__board">
      <div className="s2048__cells">
        {Array.from({ length: 16 }, (_, i) => (
          <div key={i} className="s2048__cell" />
        ))}
      </div>
      <div className="s2048__tiles">
        {tiles.map((tile) => (
          <TileView key={tile.id} tile={tile} />
        ))}
      </div>
    </div>
  );
}
