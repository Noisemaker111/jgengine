import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const labelStyle: CSSProperties = {
  fontSize: "1.1cqw",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.3em",
  color: "#ab977a",
};

export default function SlingshotSiegePreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#8fc4e8 0%, #cfe6f2 42%, #7a9a5a 42.5%, #4c6a3a 100%)",
        color: "#f3e6cf",
        fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
        userSelect: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "8%",
          top: "10%",
          width: "6cqw",
          height: "6cqw",
          borderRadius: "50%",
          background: "radial-gradient(circle, #fff9e0, #fce9a8)",
          boxShadow: "0 0 4cqw rgba(255,244,200,0.6)",
        }}
      />

      {[["16%", "0%", "10cqw"], ["30%", "3%", "8cqw"], ["68%", "1%", "12cqw"]].map(([left, top, width], i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left,
            top,
            width,
            aspectRatio: "1.5",
            background: "#f5f8fa",
            borderRadius: "50%",
            opacity: 0.85,
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          left: "10%",
          bottom: "12%",
          width: "3cqw",
          height: "12cqw",
          background: "linear-gradient(#7a5220, #4a3313)",
          borderRadius: "0.4cqw",
        }}
      >
        <span
          style={{
            position: "absolute",
            left: "50%",
            top: "-30%",
            width: "0.4cqw",
            height: "18cqw",
            transform: "translateX(-50%) rotate(-18deg)",
            transformOrigin: "bottom center",
            background: "#5a3d18",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          right: "20%",
          bottom: "12%",
          display: "flex",
          flexDirection: "column-reverse",
          gap: "0.3cqw",
        }}
      >
        {[0, 1].map((i) => (
          <span
            key={i}
            style={{
              width: "5.4cqw",
              height: "4.4cqw",
              background: "linear-gradient(#a9773f, #6b4c23)",
              border: "1px solid rgba(0,0,0,0.25)",
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          right: "21.2%",
          bottom: "21.6%",
          width: "3cqw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.2cqw",
        }}
      >
        <span
          style={{
            width: "1.6cqw",
            height: "1.6cqw",
            borderRadius: "50%",
            background: "#e8c07a",
            border: "1px solid rgba(0,0,0,0.3)",
          }}
        />
        <span
          style={{
            width: "2.6cqw",
            height: "3.4cqw",
            borderRadius: "0.6cqw 0.6cqw 0.3cqw 0.3cqw",
            background: "linear-gradient(#c8442f, #8a2c1c)",
            boxShadow: "0 0 1.4cqw rgba(200,68,47,0.5)",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: "3%",
          left: "3%",
          display: "flex",
          flexDirection: "column",
          gap: "0.4cqw",
        }}
      >
        <span style={labelStyle}>Siege 1 / 3</span>
        <span style={{ fontSize: "2.4cqw", fontWeight: 800, color: "#f3e6cf", textShadow: "0 0.2cqw 0.6cqw rgba(0,0,0,0.9)" }}>
          The Lookout Post
        </span>
      </div>

      <div style={{ position: "absolute", top: "3%", right: "3%", textAlign: "right" }}>
        <span
          style={{
            display: "block",
            fontSize: "1.1cqw",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.3em",
            color: "#ab977a",
          }}
        >
          Score
        </span>
        <span style={{ fontSize: "3.2cqw", fontWeight: 900, color: "#f3e6cf", textShadow: "0 0.2cqw 0.6cqw rgba(0,0,0,0.9)" }}>0</span>
      </div>

      <div
        style={{
          position: "absolute",
          top: "3%",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
        }}
      >
        <span style={labelStyle}>Dummies remaining</span>
        <div style={{ fontSize: "2.4cqw", fontWeight: 800, color: "#f3e6cf" }}>1</div>
      </div>

      <div style={{ position: "absolute", bottom: "3%", right: "3%", textAlign: "right" }}>
        <span style={labelStyle}>Ammo</span>
        <div style={{ display: "flex", gap: "0.6cqw", justifyContent: "flex-end", marginTop: "0.4cqw" }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: "1.6cqw",
                height: "1.6cqw",
                borderRadius: "50%",
                background: "#d8973c",
                boxShadow: "0 0 1cqw rgba(216,151,60,0.6)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
