import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const chipLabelStyle: CSSProperties = {
  fontSize: "1cqw",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: "#c9a875",
};

const dividerStyle: CSSProperties = {
  height: "2.4cqw",
  width: "1px",
  background: "rgba(253,230,138,0.25)",
};

function Building({ left, top, width, height, dark }: { left: string; top: string; width: string; height: string; dark?: boolean }) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        background: dark ? "linear-gradient(#6b5a3e, #4a3d29)" : "linear-gradient(#a8916a, #7a6647)",
        border: "1px solid rgba(0,0,0,0.35)",
        boxShadow: "0 0.3cqw 0.6cqw rgba(0,0,0,0.35)",
      }}
    />
  );
}

export default function AnnalsPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(#7fa8d8 0%, #cddcc0 42%, #6fa851 43%, #4a8a35 100%)",
        color: "#fef3c7",
        fontFamily: "ui-serif, Georgia, serif",
        userSelect: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "6%",
          top: "58%",
          width: "22cqw",
          height: "13cqw",
          borderRadius: "50%",
          background: "#2f7ea3",
          boxShadow: "inset 0 0 3cqw rgba(255,255,255,0.15)",
        }}
      />

      <div style={{ position: "absolute", left: "44%", top: "48%", width: "22cqw", height: "22cqw" }}>
        <Building left="30%" top="10%" width="10%" height="18%" dark />
        <Building left="42%" top="4%" width="12%" height="24%" />
        <Building left="56%" top="14%" width="9%" height="16%" dark />
        <Building left="20%" top="30%" width="11%" height="20%" />
        <Building left="35%" top="34%" width="13%" height="26%" dark />
        <Building left="52%" top="32%" width="10%" height="18%" />
        <Building left="66%" top="28%" width="9%" height="15%" dark />
        <Building left="28%" top="56%" width="12%" height="20%" />
        <Building left="44%" top="60%" width="10%" height="16%" dark />
        <Building left="58%" top="54%" width="11%" height="19%" />
      </div>

      <span
        style={{
          position: "absolute",
          left: "18%",
          top: "24%",
          width: "5cqw",
          height: "5cqw",
          borderRadius: "50%",
          background: "linear-gradient(#7a5230, #4a3419)",
          border: "1px solid rgba(0,0,0,0.35)",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: "78%",
          top: "68%",
          width: "4.4cqw",
          height: "4.4cqw",
          borderRadius: "50%",
          background: "linear-gradient(#7a5230, #4a3419)",
          border: "1px solid rgba(0,0,0,0.35)",
        }}
      />

      <span
        style={{
          position: "absolute",
          left: "56%",
          top: "60%",
          width: "1.6cqw",
          height: "2.4cqw",
          background: "linear-gradient(#c9a15a, #7a5230)",
          border: "1px solid rgba(0,0,0,0.4)",
          transform: "rotate(20deg)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "3%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "1.4cqw",
          borderRadius: "0.7cqw",
          border: "1px solid rgba(253,230,138,0.2)",
          background: "rgba(28,20,10,0.72)",
          padding: "0.9cqw 1.8cqw",
          boxShadow: "0 0.4cqw 1cqw rgba(0,0,0,0.4)",
        }}
      >
        <span style={{ fontSize: "1.7cqw", letterSpacing: "0.05em", color: "#fde68a" }}>The Annals</span>
        <span style={dividerStyle} />
        <span style={{ fontSize: "1.2cqw", color: "#fef3c7", opacity: 0.9 }}>Year 1, day 1 · Spring</span>
        <span style={dividerStyle} />
        <span style={{ fontSize: "1.2cqw", color: "#fef3c7", opacity: 0.8 }}>Realm 5,460</span>
        <span style={dividerStyle} />
        <span style={{ fontSize: "1.2cqw", color: "#fef3c7", opacity: 0.8 }}>Aldric, the Steadfast</span>
        <span
          style={{
            borderRadius: "0.4cqw",
            border: "1px solid rgba(253,230,138,0.3)",
            padding: "0.3cqw 0.9cqw",
            fontSize: "1.1cqw",
            color: "#fef3c7",
          }}
        >
          Pause
        </span>
        <div style={{ display: "flex", gap: "0.4cqw" }}>
          {["1x", "2x", "4x", "8x"].map((speed) => (
            <span
              key={speed}
              style={{
                borderRadius: "0.4cqw",
                border: speed === "1x" ? "1px solid #fcd34d" : "1px solid rgba(253,230,138,0.2)",
                background: speed === "1x" ? "rgba(252,211,77,0.2)" : "transparent",
                padding: "0.25cqw 0.7cqw",
                fontSize: "1.1cqw",
                color: speed === "1x" ? "#fef3c7" : "rgba(254,243,199,0.6)",
              }}
            >
              {speed}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: "3%",
          top: "16%",
          bottom: "4%",
          width: "22cqw",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: "0.7cqw",
          border: "1px solid rgba(253,230,138,0.2)",
          background: "rgba(28,20,10,0.72)",
          boxShadow: "0 0.4cqw 1cqw rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            borderBottom: "1px solid rgba(253,230,138,0.2)",
            padding: "0.9cqw 1.2cqw",
            fontSize: "1.1cqw",
            textTransform: "uppercase",
            letterSpacing: "0.2em",
            color: "#fde68a",
            opacity: 0.85,
          }}
        >
          Chronicle
        </div>
        <div style={{ padding: "1.2cqw", fontSize: "1.2cqw", lineHeight: 1.5, color: "rgba(254,243,199,0.4)" }}>
          The realm awaits its first tale.
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: "2.4%",
          bottom: "3%",
          display: "flex",
          alignItems: "center",
          gap: "0.7cqw",
          borderRadius: "0.7cqw",
          border: "1px solid rgba(253,230,138,0.2)",
          background: "rgba(28,20,10,0.72)",
          padding: "0.5cqw 1cqw",
        }}
      >
        <span style={{ height: "1.6cqw", width: "1.6cqw", borderRadius: "50%", background: "rgba(253,230,138,0.2)" }} />
        <span style={{ fontSize: "0.95cqw", color: "rgba(254,243,199,0.75)" }}>
          From a prompt by <span style={{ color: "#fde68a" }}>Ethan Mollick</span>
        </span>
      </div>
    </div>
  );
}
