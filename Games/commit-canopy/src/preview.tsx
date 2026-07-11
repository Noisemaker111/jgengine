import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const panelLabelStyle: CSSProperties = {
  fontSize: "1.3cqw",
  fontWeight: 500,
  color: "rgba(230,237,243,0.55)",
};

function IsoCell({ left, top, level }: { left: string; top: string; level: number }) {
  const colors = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];
  const heights = [0.3, 1.1, 1.9, 2.7, 3.5];
  return (
    <span
      style={{
        position: "absolute",
        left,
        top,
        width: "1.7cqw",
        height: `${heights[level]}cqw`,
        background: `linear-gradient(180deg, ${colors[level]}, #05070a)`,
        border: "0.05cqw solid rgba(255,255,255,0.08)",
        transform: "translate(-50%, -100%) skewX(-24deg) scaleY(0.7)",
      }}
    />
  );
}

const weeks = Array.from({ length: 20 }, (_, i) => i);
const days = Array.from({ length: 7 }, (_, i) => i);

export default function CommitCanopyPreview({ className }: GamePreviewProps) {
  return (
    <div
      className={className}
      style={{
        containerType: "size",
        position: "relative",
        height: "100%",
        width: "100%",
        overflow: "hidden",
        background: "linear-gradient(180deg, #010409 0%, #05070a 60%, #0b1220 100%)",
        color: "#e6edf3",
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "38%",
          top: "40%",
          width: "60%",
          height: "60%",
        }}
      >
        {weeks.map((w) =>
          days.map((d) => (
            <IsoCell key={`${w}-${d}`} left={`${(w * 2.2 + d * 1.1).toFixed(1)}cqw`} top={`${(d * 1.3).toFixed(1)}cqw`} level={0} />
          )),
        )}
      </div>

      <div
        style={{
          position: "absolute",
          top: "16%",
          left: "3%",
          bottom: "4%",
          width: "27cqw",
          display: "flex",
          flexDirection: "column",
          gap: "1.4cqw",
          padding: "1.6cqw",
          background: "rgba(0,0,0,0.8)",
          border: "1px solid rgba(110,231,183,0.15)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
        }}
      >
        <div>
          <div style={{ fontSize: "1.9cqw", fontWeight: 500, color: "#ffffff" }}>Isometric Contribution Graph</div>
          <div style={{ marginTop: "0.4cqw", fontSize: "1.3cqw", lineHeight: 1.5, color: "rgba(209,250,229,0.65)" }}>
            Paste a GitHub username or profile link.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.8cqw" }}>
          <div
            style={{
              height: "3.2cqw",
              display: "flex",
              alignItems: "center",
              padding: "0 1cqw",
              fontSize: "1.3cqw",
              fontStyle: "italic",
              color: "rgba(209,250,229,0.4)",
              border: "1px solid rgba(209,250,229,0.2)",
            }}
          >
            octocat or https://github.com/octocat
          </div>
          <div
            style={{
              height: "3.2cqw",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.3cqw",
              fontWeight: 500,
              color: "#000000",
              background: "#34d399",
            }}
          >
            Show graph
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "0.9cqw", fontSize: "1.2cqw", color: "rgba(209,250,229,0.7)" }}>
          <span
            style={{
              width: "1.4cqw",
              height: "1.4cqw",
              flexShrink: 0,
              border: "1px solid rgba(209,250,229,0.25)",
            }}
          />
          Include analytics in image
        </label>

        <div style={{ fontSize: "1.1cqw", lineHeight: 1.5, color: "rgba(209,250,229,0.55)" }}>
          Hover a box for daily count · Drag to rotate · Scroll to zoom
        </div>

        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "0.8cqw", paddingTop: "1cqw", borderTop: "1px solid rgba(209,250,229,0.1)" }}>
          <span style={{ width: "2cqw", height: "2cqw", borderRadius: "999px", background: "rgba(110,231,183,0.2)" }} />
          <span style={{ fontSize: "1cqw", lineHeight: 1.4, color: "rgba(209,250,229,0.55)" }}>
            Inspired by <span style={{ color: "#34d399" }}>radiumcoders</span>&rsquo; Isometric GitHub Contributions
          </span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          right: "3%",
          bottom: "4%",
          textAlign: "right",
        }}
      >
        <div style={panelLabelStyle}>Look up a GitHub user to begin</div>
      </div>
    </div>
  );
}
