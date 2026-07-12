import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const DUNE_GOLD = "#e0b878";
const SHADOW_OCHRE = "#a8763e";
const INDIGO_ROBE = "#33418c";
const PACK_TAN = "#c9a26a";
const RIVAL_BROWN = "#8a6a4a";
const RIVAL_RED = "#b0503c";

function place(leftPct: number, bottomPct: number, w: number): CSSProperties {
  return {
    position: "absolute",
    left: `${leftPct}%`,
    bottom: `${bottomPct}%`,
    width: `${w}cqw`,
    height: `${w * 1.6}cqw`,
    transform: "translate(-50%, 0)",
  };
}

function CamelGlyph({ style, body, robe }: { style: CSSProperties; body: string; robe: string }) {
  return (
    <div style={style}>
      <div style={{ position: "absolute", left: "20%", top: 0, width: "60%", height: "45%", borderRadius: "999px", background: body }} />
      <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: "62%", borderRadius: "40% 40% 20% 20%", background: body }} />
      <div style={{ position: "absolute", left: "28%", bottom: "18%", width: "44%", height: "18%", background: robe, borderRadius: "0.4cqmin" }} />
    </div>
  );
}

export default function DuneNomadsPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `linear-gradient(180deg, #f2d3a0 0%, #e8c48a 32%, ${DUNE_GOLD} 62%, ${SHADOW_OCHRE} 100%)`,
        userSelect: "none",
      }}
    >
      <div style={{ position: "absolute", left: "-10%", bottom: "18%", width: "60%", height: "26%", borderRadius: "50%", background: SHADOW_OCHRE, opacity: 0.5 }} />
      <div style={{ position: "absolute", right: "-15%", bottom: "10%", width: "70%", height: "30%", borderRadius: "50%", background: SHADOW_OCHRE, opacity: 0.4 }} />

      <CamelGlyph style={place(38, 8, 7)} body={PACK_TAN} robe={DUNE_GOLD} />
      <CamelGlyph style={place(62, 8, 7)} body={PACK_TAN} robe={DUNE_GOLD} />
      <CamelGlyph style={place(28, 4, 6)} body={RIVAL_BROWN} robe={RIVAL_RED} />
      <CamelGlyph style={place(50, 3, 11)} body={DUNE_GOLD} robe={INDIGO_ROBE} />

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "3%",
          transform: "translate(-50%, 0)",
          width: "40cqw",
          height: "1.2cqh",
          borderRadius: "999px",
          background: "rgba(36,26,16,0.5)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: "100%", height: "100%", background: "#3e8c6f" }} />
      </div>

      <span
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          fontSize: "1.3cqw",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#5c4526",
        }}
      >
        Water 100%
      </span>
    </div>
  );
}
