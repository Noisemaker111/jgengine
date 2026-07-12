import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  cream: "#f2e8cf",
  forestGreen: "#386641",
  signalRed: "#bc4749",
  brass: "#a98467",
  coalSmoke: "#6b705c",
  ink: "#211d14",
} as const;

const HORIZON_Y = 42;

function pineStyle(xCqw: number, yCqh: number, sizeCqw: number): CSSProperties {
  return {
    position: "absolute",
    left: `${xCqw - sizeCqw / 2}cqw`,
    top: `${yCqh - sizeCqw * 1.3}cqh`,
    width: `${sizeCqw}cqw`,
    height: `${sizeCqw * 1.3}cqw`,
    clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
    background: PALETTE.forestGreen,
  };
}

const PINES: readonly [number, number, number][] = [
  [10, 46, 4.5],
  [20, 52, 6],
  [6, 62, 8],
  [90, 46, 4.5],
  [80, 51, 6],
  [94, 63, 8.5],
  [16, 74, 10],
  [86, 76, 10],
];

export default function RailRushersPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: PALETTE.ink,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(180deg, #4f6b63 0%, ${PALETTE.cream} ${HORIZON_Y}%, ${PALETTE.cream} ${HORIZON_Y}%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: `${HORIZON_Y - 10}%`,
          width: "60cqw",
          height: "20cqh",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,250,235,0.55), transparent 68%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath:
            "polygon(0% 58%, 12% 46%, 24% 52%, 38% 40%, 50% 50%, 64% 42%, 78% 50%, 90% 44%, 100% 56%, 100% 100%, 0% 100%)",
          background: PALETTE.coalSmoke,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath:
            "polygon(0% 66%, 10% 50%, 22% 60%, 34% 44%, 48% 58%, 60% 42%, 74% 58%, 86% 48%, 100% 64%, 100% 100%, 0% 100%)",
          background: PALETTE.forestGreen,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `polygon(0% ${HORIZON_Y}%, 100% ${HORIZON_Y}%, 100% 100%, 0% 100%)`,
          background: "linear-gradient(180deg, #386641 0%, #24401f 55%, #182a18 100%)",
        }}
      />

      {PINES.slice(0, 3).map(([x, y, size], i) => (
        <div key={`back-pine-${i}`} style={pineStyle(x, y, size)} />
      ))}

      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `polygon(50% ${HORIZON_Y}%, 63% 100%, 37% 100%)`,
          background: "#4a3a28",
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(20,16,10,0.4) 0%, rgba(20,16,10,0.4) 3%, transparent 3%, transparent 10%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `polygon(50% ${HORIZON_Y}%, 50.5% ${HORIZON_Y}%, 39% 100%, 37.4% 100%)`,
          background: PALETTE.brass,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `polygon(50% ${HORIZON_Y}%, 49.5% ${HORIZON_Y}%, 62.6% 100%, 61% 100%)`,
          background: PALETTE.brass,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50cqw",
          top: `${HORIZON_Y}cqh`,
          width: "0.5cqw",
          height: "9cqh",
          transform: "translate(-50%, -100%)",
          background: PALETTE.coalSmoke,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50.9cqw",
          top: `${HORIZON_Y - 8}cqh`,
          width: "1.6cqw",
          height: "1.6cqw",
          borderRadius: "50%",
          background: PALETTE.forestGreen,
          boxShadow: `0 0 1.4cqw ${PALETTE.forestGreen}`,
        }}
      />

      <div style={{ position: "absolute", left: "60cqw", top: `${HORIZON_Y - 5}cqh`, width: "11cqw", height: "9cqh" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "45%",
            clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
            background: PALETTE.forestGreen,
          }}
        />
        <div style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: "62%", background: PALETTE.cream }} />
      </div>

      {PINES.slice(3).map(([x, y, size], i) => (
        <div key={`front-pine-${i}`} style={pineStyle(x, y, size)} />
      ))}

      <div
        style={{
          position: "absolute",
          left: "-3cqw",
          bottom: "6cqh",
          width: "13cqw",
          height: "13cqh",
        }}
      >
        <div style={{ position: "absolute", left: "18%", bottom: "48%", width: "64%", height: "38%", background: PALETTE.signalRed, borderRadius: "0.4cqw" }} />
        <div style={{ position: "absolute", left: "0%", bottom: "0%", width: "100%", height: "52%", background: "#8f3335", borderRadius: "0.4cqw" }} />
        <div style={{ position: "absolute", left: "26%", bottom: "58%", width: "26%", height: "20%", background: PALETTE.cream, opacity: 0.85 }} />
        <div
          style={{
            position: "absolute",
            right: "8%",
            bottom: "40%",
            width: "1.4cqw",
            height: "1.4cqw",
            borderRadius: "50%",
            background: PALETTE.cream,
            boxShadow: `0 0 1cqw ${PALETTE.cream}`,
          }}
        />
      </div>

      <div style={{ position: "absolute", left: "50%", bottom: "2cqh", width: "30cqw", height: "24cqh", transform: "translateX(-50%)" }}>
        <div style={{ position: "absolute", left: "6%", bottom: "0%", width: "16%", height: "34%", borderRadius: "50%", background: PALETTE.coalSmoke }} />
        <div style={{ position: "absolute", right: "6%", bottom: "0%", width: "16%", height: "34%", borderRadius: "50%", background: PALETTE.coalSmoke }} />
        <div
          style={{
            position: "absolute",
            left: "8%",
            bottom: "24%",
            width: "84%",
            height: "20%",
            background: PALETTE.brass,
            borderRadius: "0.5cqw",
            boxShadow: "0 0.4cqw 0 rgba(0,0,0,0.35)",
          }}
        />
        <div style={{ position: "absolute", left: "22%", bottom: "40%", width: "6%", height: "42%", background: PALETTE.coalSmoke }} />
        <div style={{ position: "absolute", right: "22%", bottom: "40%", width: "6%", height: "42%", background: PALETTE.coalSmoke }} />
        <div style={{ position: "absolute", left: "18%", bottom: "80%", width: "64%", height: "9%", background: PALETTE.signalRed, borderRadius: "0.3cqw" }} />
        <div style={{ position: "absolute", left: "30%", bottom: "44%", width: "40%", height: "26%", background: PALETTE.cream, opacity: 0.9 }} />
      </div>

      <span
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          fontFamily: "ui-monospace, monospace",
          fontSize: "1.7cqw",
          fontWeight: 800,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: PALETTE.signalRed,
          textShadow: "0 1px 2px rgba(0,0,0,0.35)",
        }}
      >
        Express due 4:00
      </span>
    </div>
  );
}
