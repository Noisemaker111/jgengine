import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const SKY = "#0d1526";
const FOG = "#182238";
const FLOOR = "#303748";
const FLOOR_LINE = "#48546a";
const WALL_TRIM = "#f5a623";
const PYLON = "#38e1ff";

const DRONE = { body: "#8be36b", accent: "#1c3a12" };
const SKITTER = { body: "#e3b04b", accent: "#3a2a0c" };

const panelLabelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.28em",
  color: "#94a3b8",
};

function Pylon({ left }: { left: string }) {
  return (
    <span style={{ position: "absolute", left, top: "43%", width: "1.3cqw", height: "8cqw", background: "#1a222c" }}>
      <span
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "1.3cqw",
          background: PYLON,
          boxShadow: `0 0 1.6cqw ${PYLON}`,
        }}
      />
    </span>
  );
}

function Crate({ left, bottom, width, color }: { left: string; bottom: string; width: string; color: string }) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        bottom,
        width,
        aspectRatio: "1.5",
        background: `linear-gradient(160deg, ${color}, #1a2028)`,
        border: "1px solid rgba(255,255,255,0.12)",
        transform: "skewX(-4deg)",
      }}
    />
  );
}

function Enemy({
  left,
  bottom,
  width,
  tint,
}: {
  left: string;
  bottom: string;
  width: string;
  tint: { body: string; accent: string };
}) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        bottom,
        width,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        filter: "drop-shadow(0 0.3cqw 0.4cqw rgba(0,0,0,0.6))",
      }}
    >
      <span
        style={{
          width: "34%",
          aspectRatio: "1",
          borderRadius: "50%",
          background: tint.accent,
          boxShadow: `0 0 0.9cqw ${tint.accent}`,
        }}
      />
      <span
        style={{
          marginTop: "-6%",
          width: "100%",
          aspectRatio: "0.82",
          borderRadius: "38% 38% 46% 46%",
          background: `linear-gradient(180deg, ${tint.body}, ${tint.accent})`,
          border: "1px solid rgba(0,0,0,0.35)",
        }}
      />
    </span>
  );
}

export default function LootShooterPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: `linear-gradient(${SKY} 0%, ${FOG} 52%, ${FLOOR} 52.5%, #23293a 100%)`,
        color: "#e2e8f0",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "52%",
          bottom: 0,
          background: `linear-gradient(to bottom, rgba(245,166,35,0.12), transparent 30%), repeating-linear-gradient(to right, ${FLOOR_LINE}88 0 1px, transparent 1px 9cqw), repeating-linear-gradient(to bottom, ${FLOOR_LINE}88 0 1px, transparent 1px 7cqw)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "6%",
          right: "6%",
          top: "56%",
          bottom: "5%",
          border: `2px dashed ${WALL_TRIM}59`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "52%",
          height: "0.5cqw",
          backgroundImage: `repeating-linear-gradient(to right, ${WALL_TRIM} 0 3cqw, transparent 3cqw 5cqw)`,
          opacity: 0.8,
        }}
      />

      <Pylon left="8%" />
      <Pylon left="28%" />
      <Pylon left="66%" />
      <Pylon left="88%" />

      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "55%",
          width: "9cqw",
          height: "2.4cqw",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `1px solid ${PYLON}77`,
          boxShadow: `0 0 1.4cqw ${PYLON}55`,
        }}
      />

      <Enemy left="43%" bottom="21%" width="4.4cqw" tint={DRONE} />
      <Enemy left="58%" bottom="24%" width="4cqw" tint={DRONE} />
      <Enemy left="72%" bottom="17%" width="5.4cqw" tint={SKITTER} />

      <Crate left="14%" bottom="15%" width="10cqw" color="#4a5566" />
      <Crate left="23%" bottom="11%" width="7.5cqw" color="#96702a" />
      <Crate left="82%" bottom="20%" width="8.5cqw" color="#4a5566" />

      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <span style={{ position: "relative", width: "3.4cqw", height: "3.4cqw" }}>
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "0.3cqw",
              height: "0.3cqw",
              transform: "translate(-50%,-50%)",
              background: "rgba(255,255,255,0.9)",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: "0.25cqw",
              height: "0.9cqw",
              transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.8)",
            }}
          />
          <span
            style={{
              position: "absolute",
              left: "50%",
              bottom: 0,
              width: "0.25cqw",
              height: "0.9cqw",
              transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.8)",
            }}
          />
          <span
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              height: "0.25cqw",
              width: "0.9cqw",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.8)",
            }}
          />
          <span
            style={{
              position: "absolute",
              top: "50%",
              right: 0,
              height: "0.25cqw",
              width: "0.9cqw",
              transform: "translateY(-50%)",
              background: "rgba(255,255,255,0.8)",
            }}
          />
        </span>
      </div>

      <div style={{ position: "absolute", top: "4%", left: "3%" }}>
        <div style={panelLabelStyle}>Wave</div>
        <div style={{ fontSize: "2.4cqw", fontWeight: 900, color: "#fcd34d" }}>1</div>
      </div>

      <div style={{ position: "absolute", bottom: "4%", left: "3%", width: "22cqw" }}>
        <div
          style={{
            position: "relative",
            height: "1.8cqw",
            transform: "skewX(-12deg)",
            background: "rgba(2,6,12,0.7)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to right, #16a34a, #a3e635)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
