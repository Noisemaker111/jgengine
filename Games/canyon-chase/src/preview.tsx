import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const AMBER = "#ffc857";
const CREAM = "#e8d7c3";

const hudChipStyle: CSSProperties = {
  borderRadius: "0.8cqw",
  border: "1px solid rgba(255,200,87,0.35)",
  background: "rgba(36,26,44,0.85)",
  padding: "0.5cqw 1.2cqw",
  boxShadow: "0 0.5cqw 1.4cqw rgba(0,0,0,0.4)",
};

const hudLabelStyle: CSSProperties = {
  fontSize: "0.85cqw",
  textTransform: "uppercase",
  letterSpacing: "0.24em",
  color: "rgba(232,215,195,0.6)",
};

export default function CanyonChasePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#120d12",
        color: CREAM,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, #2c2140 0%, #4b3b63 38%, #b0603a 62%, #7a3f2a 74%, #170d0b 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          top: "38%",
          width: "0",
          height: "0",
          borderLeft: "50cqw solid transparent",
          borderRight: "50cqw solid transparent",
          borderTop: "36cqw solid #24160f",
          transform: "translateX(-27cqw)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 0,
          top: "38%",
          width: "0",
          height: "0",
          borderLeft: "50cqw solid transparent",
          borderRight: "50cqw solid transparent",
          borderTop: "36cqw solid #1c1210",
          transform: "translateX(27cqw)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "36%",
          width: "0.3cqw",
          height: "0.3cqw",
          borderRadius: "50%",
          background: "rgba(255,200,87,0.5)",
          boxShadow: "0 0 3cqw 1.5cqw rgba(255,200,87,0.25)",
          transform: "translateX(-50%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "18%",
          right: "18%",
          top: "38%",
          bottom: 0,
          background: "linear-gradient(180deg, #6b4128 0%, #8a5334 40%, #a9683f 100%)",
          clipPath: "polygon(42% 0, 58% 0, 100% 100%, 0 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "18%",
          right: "18%",
          top: "38%",
          bottom: 0,
          clipPath: "polygon(42% 0, 58% 0, 100% 100%, 0 100%)",
          background:
            "repeating-linear-gradient(180deg, transparent 0 4%, rgba(0,0,0,0.16) 4% 4.6%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "38%",
          bottom: 0,
          width: "0.35cqw",
          background:
            "repeating-linear-gradient(180deg, rgba(255,220,150,0.55) 0 8%, transparent 8% 16%)",
          transform: "translateX(-50%)",
          clipPath: "polygon(48% 0, 52% 0, 90% 100%, 10% 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "48.5%",
          top: "55%",
          width: "4.4cqw",
          height: "4.4cqw",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "0.6cqw",
            background: "linear-gradient(180deg, #7a2812, #4b2011)",
            boxShadow: "0 0.4cqw 1cqw rgba(0,0,0,0.5)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "12%",
            right: "12%",
            top: "-38%",
            height: "42%",
            borderRadius: "0.3cqw",
            background: "#4b3b63",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: "51%",
          bottom: "6%",
          width: "9cqw",
          height: "9cqw",
          transform: "translateX(-50%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "1cqw",
            background: "linear-gradient(180deg, #e8d7c3, #c9b79f)",
            boxShadow: "0 0.6cqw 1.6cqw rgba(0,0,0,0.55)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "16%",
            right: "16%",
            top: "-32%",
            height: "44%",
            borderRadius: "0.5cqw",
            background: "#33465c",
          }}
        />
        <span
          style={{
            position: "absolute",
            left: "18%",
            top: "6%",
            width: "0.9cqw",
            height: "0.6cqw",
            borderRadius: "0.2cqw",
            background: AMBER,
            boxShadow: `0 0 1cqw ${AMBER}`,
          }}
        />
        <span
          style={{
            position: "absolute",
            right: "18%",
            top: "6%",
            width: "0.9cqw",
            height: "0.6cqw",
            borderRadius: "0.2cqw",
            background: AMBER,
            boxShadow: `0 0 1cqw ${AMBER}`,
          }}
        />
      </div>

      <div style={{ position: "absolute", left: "3%", top: "4%", ...hudChipStyle }}>
        <div style={hudLabelStyle}>Elapsed</div>
        <div style={{ fontSize: "1.6cqw", fontWeight: 800, color: CREAM }}>0:00</div>
      </div>

      <div style={{ position: "absolute", right: "3%", top: "4%", ...hudChipStyle }}>
        <div style={{ ...hudLabelStyle, textAlign: "right" }}>Gap to Target</div>
        <div style={{ fontSize: "1.6cqw", fontWeight: 800, color: CREAM, textAlign: "right" }}>0m</div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "3%",
          transform: "translateX(-50%)",
          ...hudChipStyle,
          maxWidth: "70cqw",
        }}
      >
        <div style={{ ...hudLabelStyle, color: "rgba(255,200,87,0.8)" }}>Pursuit Radio</div>
        <div style={{ fontSize: "1cqw", fontFamily: "ui-monospace, monospace", color: CREAM }}>
          Copy — target&apos;s rolling for the border. Trust the survey, not the rock.
        </div>
      </div>
    </div>
  );
}
