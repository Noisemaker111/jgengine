import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const ACID = "#d7ff43";

interface Block {
  gx: number;
  gz: number;
  w: number;
  d: number;
  h: number;
  color: string;
}

const BLOCKS: readonly Block[] = [
  { gx: -2, gz: -2, w: 9, d: 6, h: 5, color: "#8fbf8a" },
  { gx: 0, gz: -2, w: 9, d: 9, h: 4, color: "#c9b382" },
  { gx: 2, gz: -2, w: 11, d: 5, h: 6, color: "#8a93a0" },
  { gx: -2, gz: 0, w: 8, d: 6, h: 4, color: "#7fbf7a" },
  { gx: 0, gz: 0, w: 9, d: 9, h: 3, color: "#d8c393" },
  { gx: 2, gz: 0, w: 7, d: 7, h: 8, color: "#e9e4d8" },
  { gx: -2, gz: 2, w: 7, d: 7, h: 6, color: "#5a5d55" },
  { gx: 2, gz: 2, w: 8, d: 6, h: 4, color: "#7fbf7a" },
  { gx: -4, gz: 0, w: 11, d: 5, h: 5, color: "#8a93a0" },
  { gx: 4, gz: 0, w: 6, d: 6, h: 13, color: "#4c4f48" },
];

function gxToLeft(gx: number): number {
  return 50 + gx * 6.5;
}
function gzToTop(gz: number): number {
  return 52 + gz * 6.5;
}

function CityBlock({ block }: { block: Block }) {
  const left = gxToLeft(block.gx);
  const top = gzToTop(block.gz);
  return (
    <div
      style={{
        position: "absolute",
        left: `${left}%`,
        top: `${top}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: `${-block.w / 2}cqw`,
          top: `${-block.d / 2 + block.h * 0.35}cqw`,
          width: `${block.w}cqw`,
          height: `${block.d}cqw`,
          borderRadius: "0.3cqw",
          background: "rgba(10,12,10,0.35)",
          filter: "blur(0.3cqw)",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: `${-block.w / 2}cqw`,
          top: `${-block.d / 2 - block.h * 0.55}cqw`,
          width: `${block.w}cqw`,
          height: `${block.d + block.h * 0.55}cqw`,
          borderRadius: "0.25cqw",
          background: `linear-gradient(${block.color}, ${block.color}dd 60%, rgba(0,0,0,0.35))`,
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)",
        }}
      />
    </div>
  );
}

export default function MonumentPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#3a3d38, #6b6f64 55%, #7c8071)",
        color: "#eeeae0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "6.5cqw 6.5cqh",
        }}
      />

      {BLOCKS.map((block, i) => (
        <CityBlock key={i} block={block} />
      ))}

      <div
        style={{
          position: "absolute",
          top: "4%",
          left: "3%",
          display: "flex",
          alignItems: "center",
          gap: "0.6cqw",
          borderRadius: "0.6cqw",
          background: "rgba(23,25,22,0.7)",
          padding: "0.6cqw 1.1cqw",
        }}
      >
        <span style={{ width: "0.6cqw", height: "0.6cqw", borderRadius: "50%", background: ACID }} />
        <span style={{ fontSize: "1.1cqw", fontWeight: 700, letterSpacing: "0.12em", color: "#eeeae0" }}>Day 1</span>
      </div>
    </div>
  );
}
