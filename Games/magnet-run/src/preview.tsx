import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const PALETTE = {
  gunmetal: "#2b2f36",
  gunmetalDark: "#20242a",
  positiveRed: "#ff4b3e",
  negativeBlue: "#3e7bff",
  cautionStripe: "#ffd23f",
  steelWhite: "#dfe6ee",
} as const;

const NEAR_LEFT = 10;
const NEAR_RIGHT = 90;
const FAR_LEFT = 44;
const FAR_RIGHT = 56;
const FAR_Y = 32;

const LANE_NEAR_WIDTH = (NEAR_RIGHT - NEAR_LEFT) / 3;
const LANE_FAR_WIDTH = (FAR_RIGHT - FAR_LEFT) / 3;

function laneCenterNear(lane: 0 | 1 | 2): number {
  return NEAR_LEFT + LANE_NEAR_WIDTH * (lane + 0.5);
}

function dividerPolygon(laneEdge: 1 | 2): string {
  const nearX = NEAR_LEFT + LANE_NEAR_WIDTH * laneEdge;
  const farX = FAR_LEFT + LANE_FAR_WIDTH * laneEdge;
  return `polygon(${nearX - 0.5}% 100%, ${nearX + 0.5}% 100%, ${farX + 0.12}% ${FAR_Y}%, ${farX - 0.12}% ${FAR_Y}%)`;
}

const floorStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  clipPath: `polygon(${NEAR_LEFT}% 100%, ${NEAR_RIGHT}% 100%, ${FAR_RIGHT}% ${FAR_Y}%, ${FAR_LEFT}% ${FAR_Y}%)`,
  background: `linear-gradient(0deg, rgba(62,123,255,0.6) 0%, rgba(62,123,255,0.28) 35%, ${PALETTE.gunmetalDark} 78%)`,
};

const leftWallStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  clipPath: `polygon(0% 100%, ${NEAR_LEFT}% 100%, ${FAR_LEFT}% ${FAR_Y}%, 0% ${FAR_Y}%)`,
  background: `linear-gradient(90deg, ${PALETTE.gunmetalDark}, ${PALETTE.gunmetal})`,
};

const rightWallStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  clipPath: `polygon(${NEAR_RIGHT}% 100%, 100% 100%, 100% ${FAR_Y}%, ${FAR_RIGHT}% ${FAR_Y}%)`,
  background: `linear-gradient(270deg, ${PALETTE.gunmetalDark}, ${PALETTE.gunmetal})`,
};

const ceilingStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  height: `${FAR_Y}%`,
  background: `linear-gradient(180deg, ${PALETTE.gunmetalDark}, #16191d)`,
};

export default function MagnetRunPreview({ className }: GamePreviewProps) {
  const botX = laneCenterNear(1);

  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#16191d",
        color: PALETTE.steelWhite,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={ceilingStyle} />
      <div style={leftWallStyle} />
      <div style={rightWallStyle} />
      <div style={floorStyle} />
      <div style={{ position: "absolute", inset: 0, clipPath: dividerPolygon(1), background: `${PALETTE.cautionStripe}55` }} />
      <div style={{ position: "absolute", inset: 0, clipPath: dividerPolygon(2), background: `${PALETTE.cautionStripe}55` }} />

      <div
        style={{
          position: "absolute",
          left: `${FAR_LEFT}%`,
          top: `${FAR_Y - 2}%`,
          width: `${FAR_RIGHT - FAR_LEFT}%`,
          height: "1.2cqh",
          background: PALETTE.gunmetalDark,
          boxShadow: "0 0 1.5cqh rgba(0,0,0,0.6)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: `${botX}%`,
          bottom: "13cqh",
          transform: "translate(-50%, 50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.6cqh",
        }}
      >
        <div
          style={{
            height: "9cqh",
            width: "9cqh",
            borderRadius: "50%",
            background: PALETTE.positiveRed,
            border: `0.3cqh solid ${PALETTE.positiveRed}aa`,
            boxShadow: `0 0 3cqh ${PALETTE.positiveRed}88, 0 1cqh 2cqh rgba(0,0,0,0.5)`,
            display: "grid",
            placeItems: "center",
            fontSize: "4.2cqh",
            fontWeight: 900,
            color: "#fff",
          }}
        >
          +
        </div>
        <div
          style={{
            height: "0.9cqh",
            width: "5.5cqw",
            borderRadius: "50%",
            background: "rgba(0,0,0,0.45)",
            filter: "blur(1px)",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "6cqh",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "1.4cqw",
        }}
      >
        {([0, 1, 2] as const).map((lane) => (
          <span
            key={lane}
            style={{
              height: "1.4cqh",
              width: "1.4cqh",
              borderRadius: "50%",
              background: lane === 1 ? PALETTE.steelWhite : "#4a4f58",
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          top: "3cqh",
          left: "3cqw",
          display: "flex",
          flexDirection: "column",
          gap: "0.3cqh",
        }}
      >
        <span
          style={{
            fontSize: "2cqw",
            fontWeight: 900,
            letterSpacing: "0.16em",
            color: PALETTE.cautionStripe,
          }}
        >
          SECTOR 1
        </span>
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: "1.3cqw",
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: "rgba(223,230,238,0.75)",
          }}
        >
          SPEED 0
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          top: "3cqh",
          right: "3cqw",
          display: "flex",
          alignItems: "center",
          gap: "0.6cqw",
          borderRadius: "0.6cqw",
          background: "rgba(43,47,54,0.75)",
          padding: "0.6cqh 1cqw",
        }}
      >
        <span
          style={{
            height: "1.4cqh",
            width: "1.4cqh",
            borderRadius: "50%",
            background: PALETTE.positiveRed,
          }}
        />
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: "1.1cqw",
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: "rgba(223,230,238,0.85)",
          }}
        >
          POLARITY +
        </span>
      </div>
    </div>
  );
}
