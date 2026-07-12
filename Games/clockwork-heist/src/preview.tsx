import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const eyebrowStyle: CSSProperties = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "1.1cqw",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.42em",
  color: "#c9a227",
};

const statLabelStyle: CSSProperties = {
  fontSize: "1cqw",
  textTransform: "uppercase",
  letterSpacing: "0.24em",
  color: "rgba(229,217,195,0.4)",
};

const statValueStyle: CSSProperties = {
  marginTop: "0.5cqw",
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: "1.6cqw",
  color: "#f4e8ca",
};

function BriefingStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#0b1322", padding: "1.6cqw 0.8cqw" }}>
      <div style={statLabelStyle}>{label}</div>
      <div style={statValueStyle}>{value}</div>
    </div>
  );
}

const treasures = [
  { name: "The Ormolu Clock", value: 1800 },
  { name: "The First Folio", value: 2400 },
  { name: "The Sable Necklace", value: 3200 },
  { name: "The Marechal's Saber", value: 1500 },
  { name: "The Silver Epergne", value: 900 },
];

export default function ClockworkHeistPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(135deg, #1d2b4a 0%, #07101d 55%, #03070d 100%)",
        color: "#f4e8ca",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 72% 22%, rgba(201,162,39,0.18), transparent 34%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "-8%",
          top: "-16%",
          aspectRatio: "1",
          width: "38cqw",
          borderRadius: "50%",
          border: "1px solid rgba(201,162,39,0.22)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "6%",
          top: "18%",
          height: "16cqw",
          width: "1px",
          transformOrigin: "bottom",
          transform: "rotate(38deg)",
          background: "linear-gradient(to top, #c9a227, transparent)",
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 4cqw",
          }}
        >
          <div style={eyebrowStyle}>A gentleman&apos;s occupation</div>
          <div
            style={{
              marginTop: "1.4cqw",
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontWeight: 600,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
            }}
          >
            <div style={{ fontSize: "6cqw", color: "#fff3d6" }}>Clockwork</div>
            <div style={{ fontSize: "6cqw", fontStyle: "italic", color: "#d8bd66", paddingLeft: "0.7em" }}>Heist</div>
          </div>
          <div
            style={{
              marginTop: "2cqw",
              maxWidth: "26cqw",
              borderLeft: "1px solid rgba(201,162,39,0.55)",
              paddingLeft: "1.2cqw",
              fontSize: "1.4cqw",
              lineHeight: 1.5,
              color: "rgba(229,217,195,0.78)",
            }}
          >
            Every guard, door, and sweeping light keeps published time. Slip between its beats before 05:00.
          </div>

          <div style={{ marginTop: "3cqw", display: "flex", alignItems: "center", gap: "1.4cqw" }}>
            <span
              style={{
                position: "relative",
                border: "1px solid #d5b64c",
                background: "#7a1f2b",
                padding: "1cqw 2.4cqw",
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "1.5cqw",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                color: "#fff3d6",
                boxShadow: "0 1.2cqw 3.4cqw rgba(0,0,0,0.42)",
              }}
            >
              Begin the heist
            </span>
            <span style={{ fontSize: "1cqw", textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(229,217,195,0.4)" }}>
              Move quietly · hold to lift
            </span>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            borderLeft: "1px solid rgba(201,162,39,0.2)",
            background: "rgba(0,0,0,0.15)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "3cqw",
          }}
        >
          <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "1.1cqw", textTransform: "uppercase", letterSpacing: "0.3em", color: "#c9a227" }}>
            The five marks
          </div>
          <div style={{ marginTop: "1.2cqw", display: "flex", flexDirection: "column" }}>
            {treasures.map((treasure, index) => (
              <div
                key={treasure.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.4cqw 1fr auto",
                  alignItems: "center",
                  gap: "0.8cqw",
                  borderBottom: "1px solid rgba(201,162,39,0.15)",
                  padding: "0.9cqw 0",
                }}
              >
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1cqw", color: "rgba(201,162,39,0.6)" }}>0{index + 1}</span>
                <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "1.4cqw", color: "rgba(242,227,194,0.9)" }}>{treasure.name}</span>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.3cqw", color: "#d8bd66" }}>{treasure.value}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "2cqw", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", background: "rgba(201,162,39,0.2)" }}>
            <BriefingStat label="Deadline" value="05:00" />
            <BriefingStat label="Method" value="Silent" />
            <BriefingStat label="Exit" value="West" />
          </div>
        </div>
      </div>
    </div>
  );
}
