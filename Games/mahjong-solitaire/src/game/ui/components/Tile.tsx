import { memo, type ReactNode } from "react";

import type { TileState } from "../../session";
import { accentOf } from "../../mahjong/tiles";
import { FaceGlyph } from "./Glyphs";

const BONE = "linear-gradient(152deg,#fffdf5 0%,#f4e9d0 55%,#e8dabb 100%)";

function ring(state: TileState, hovered: boolean, interactive: boolean): string {
  if (state === "selected") return "0 0 0 3px #c0392b, 0 0 16px rgba(192,57,43,0.75)";
  if (state === "hinted") return "0 0 0 3px #e6c65a, 0 0 18px rgba(230,198,90,0.85)";
  if (state === "free" && hovered && interactive) return "0 0 0 2px rgba(74,168,150,0.95)";
  if (state === "free") return "0 0 0 1px rgba(96,166,142,0.4)";
  return "0 0 0 1px rgba(120,92,40,0.15)";
}

export interface TileProps {
  id: number;
  faceId: string;
  w: number;
  h: number;
  left: number;
  top: number;
  zIndex: number;
  state: TileState;
  hovered: boolean;
  onPick: (id: number) => void;
  onHover: (id: number | null) => void;
}

function TileImpl({ id, faceId, w, h, left, top, zIndex, state, hovered, onPick, onHover }: TileProps): ReactNode {
  const interactive = state !== "blocked";
  const radius = Math.round(w * 0.17);
  const lift = state === "selected" ? -4 : hovered && interactive ? -2 : 0;
  const boxShadow = [
    "inset 1.5px 1.5px 0 rgba(255,255,255,0.8)",
    "inset -1.5px -2px 0 rgba(150,120,70,0.28)",
    "2px 2px 0 #e6d8b4",
    "3px 4px 0 #d7c69d",
    "4px 6px 8px rgba(0,0,0,0.4)",
    ring(state, hovered, interactive),
  ].join(", ");

  return (
    <div
      onClick={() => onPick(id)}
      onPointerEnter={() => onHover(id)}
      onPointerLeave={() => onHover(null)}
      style={{
        position: "absolute",
        left,
        top,
        width: w,
        height: h,
        zIndex,
        cursor: interactive ? "pointer" : "default",
        transform: lift === 0 ? undefined : `translateY(${lift}px)`,
        transition: "transform 0.09s ease",
      }}
    >
      <div
        style={{
          width: w,
          height: h,
          borderRadius: radius,
          background: BONE,
          border: "1px solid rgba(120,92,40,0.35)",
          boxShadow,
          filter: state === "blocked" ? "brightness(0.9) saturate(0.85)" : undefined,
          position: "relative",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 3, left: 4, width: 5, height: 5, borderRadius: 5, background: accentOf(faceId), opacity: 0.7 }} />
        <div style={{ position: "absolute", inset: `${Math.round(h * 0.06)}px ${Math.round(w * 0.1)}px` }}>
          <FaceGlyph faceId={faceId} />
        </div>
      </div>
    </div>
  );
}

export const Tile = memo(TileImpl);
