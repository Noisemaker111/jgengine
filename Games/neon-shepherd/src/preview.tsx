import type { GamePreviewProps } from "@jgengine/react/preview";

const inkWhite = "#eef4f0";
const spiritMint = "#7ef9c8";
const streetlightAmber = "#f5c56b";

const CLUSTER = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * Math.PI * 2;
  const radius = 3 + ((i * 13) % 7);
  return {
    left: 50 + Math.cos(angle) * radius * 0.9,
    top: 74 + Math.sin(angle) * radius * 0.6,
  };
});

export default function NeonShepherdPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "#101318",
        color: inkWhite,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(to right, rgba(126,249,200,0.05) 0 1px, transparent 1px 8cqw), repeating-linear-gradient(to bottom, rgba(126,249,200,0.04) 0 1px, transparent 1px 8cqw)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "18%",
          right: "18%",
          top: 0,
          bottom: 0,
          background: "linear-gradient(#0c0e12, #14181f)",
          boxShadow: "0 0 4cqw rgba(0,0,0,0.5)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "18%",
          top: 0,
          bottom: 0,
          width: "0.15cqw",
          background: "rgba(126,249,200,0.2)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "18%",
          top: 0,
          bottom: 0,
          width: "0.15cqw",
          background: "rgba(126,249,200,0.2)",
        }}
      />

      {[0.14, 0.4, 0.66].map((t, i) => (
        <span
          key={`l${i}`}
          style={{
            position: "absolute",
            left: "16.5%",
            top: `${8 + t * 70}%`,
            width: "1cqw",
            height: "1cqw",
            borderRadius: "50%",
            background: streetlightAmber,
            boxShadow: `0 0 2.4cqw ${streetlightAmber}`,
            opacity: 0.85,
          }}
        />
      ))}
      {[0.06, 0.32, 0.58].map((t, i) => (
        <span
          key={`r${i}`}
          style={{
            position: "absolute",
            right: "16.5%",
            top: `${14 + t * 70}%`,
            width: "1cqw",
            height: "1cqw",
            borderRadius: "50%",
            background: streetlightAmber,
            boxShadow: `0 0 2.4cqw ${streetlightAmber}`,
            opacity: 0.85,
          }}
        />
      ))}

      {CLUSTER.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: "0.9cqw",
            height: "0.9cqw",
            borderRadius: "50%",
            background: spiritMint,
            boxShadow: "0 0 1.2cqw rgba(126,249,200,0.75)",
          }}
        />
      ))}

      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "74%",
          transform: "translate(-50%, -50%)",
          width: "1.8cqw",
          height: "1.8cqw",
          borderRadius: "50%",
          background: inkWhite,
          boxShadow: "0 0 1.6cqw rgba(238,244,240,0.8)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "5%",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "0.6cqw",
          borderRadius: "0.6cqw",
          background: "rgba(16,19,24,0.75)",
          padding: "0.5cqw 1.2cqw",
        }}
      >
        <span style={{ width: "0.6cqw", height: "0.6cqw", borderRadius: "50%", background: spiritMint }} />
        <span style={{ fontSize: "1.1cqw", fontWeight: 700, letterSpacing: "0.1em", color: inkWhite }}>Herd 20</span>
      </div>
    </div>
  );
}
