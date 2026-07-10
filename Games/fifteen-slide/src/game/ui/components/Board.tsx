import { useMemo } from "react";

import { colOf, rowOf } from "../../puzzle/logic";
import type { PuzzleSnapshot } from "../../puzzle/store";
import { COLORS, numeralStyle, tileStyle } from "../theme";

export function Board({
  snapshot,
  onTile,
}: {
  snapshot: PuzzleSnapshot;
  onTile: (index: number) => void;
}) {
  const { size: n, tiles, status } = snapshot;
  const solved = status === "solved";
  const cellPct = 100 / n;
  const numeral = numeralStyle(1 / n);
  const slots = useMemo(() => Array.from({ length: n * n }, (_, i) => i), [n]);

  return (
    <div
      className="relative rounded-2xl p-[3.5%]"
      style={{
        width: "min(92vw, 66vh, 560px)",
        aspectRatio: "1 / 1",
        background: "linear-gradient(160deg, #241d14 0%, #14100a 100%)",
        border: `1px solid ${COLORS.frame}`,
        boxShadow: "inset 0 2px 7px rgba(0,0,0,0.6), 0 20px 46px rgba(0,0,0,0.55)",
        outline: `1px solid rgba(216,178,74,${solved ? 0.55 : 0.16})`,
        outlineOffset: -6,
        transition: "outline-color 320ms ease",
      }}
    >
      <div className="relative h-full w-full" style={{ containerType: "inline-size" }}>
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
          aria-hidden
        >
          {slots.map((i) => (
            <div key={i} className="p-[1.5%]">
              <div
                className="h-full w-full rounded-md"
                style={{ background: COLORS.slot, boxShadow: "inset 0 2px 5px rgba(0,0,0,0.7)" }}
              />
            </div>
          ))}
        </div>

        {tiles.map((value, index) => {
          if (value === 0) return null;
          const row = rowOf(index, n);
          const col = colOf(index, n);
          return (
            <button
              key={value}
              type="button"
              aria-label={`Tile ${value}`}
              onClick={() => onTile(index)}
              className="absolute cursor-pointer p-[1.5%] focus:outline-none"
              style={{
                width: `${cellPct}%`,
                height: `${cellPct}%`,
                transform: `translate(${col * 100}%, ${row * 100}%)`,
                transition: "transform 140ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              }}
            >
              <div
                className="flex h-full w-full items-center justify-center rounded-md transition-transform active:scale-[0.97]"
                style={tileStyle(solved)}
              >
                <span style={numeral}>{value}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
