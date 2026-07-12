import type { CSSProperties } from "react";
import type { GamePreviewProps } from "@jgengine/react/preview";

const LEVEL_COLORS = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];
const HEIGHTS = [0.3, 1.1, 1.9, 2.7, 3.5];

const WEEKS = 22;
const DAYS = 7;

function levelAt(week: number, day: number): number {
  const wave = Math.sin(week * 0.55 + day * 0.3) * 0.5 + 0.5;
  const streak = (week * 7 + day) % 11 === 0 ? 1 : 0;
  const weekend = day === 0 || day === 6 ? 0.5 : 1;
  const raw = Math.round(wave * 3 * weekend) + streak;
  return Math.max(0, Math.min(4, raw));
}

function IsoCell({ left, top, level }: { left: string; top: string; level: number }) {
  return (
    <span
      style={{
        position: "absolute",
        left,
        top,
        width: "1.7cqw",
        height: `${HEIGHTS[level]}cqw`,
        background: `linear-gradient(180deg, ${LEVEL_COLORS[level]}, #05070a)`,
        border: "0.05cqw solid rgba(255,255,255,0.08)",
        transform: "translate(-50%, -100%) skewX(-24deg) scaleY(0.7)",
      }}
    />
  );
}

const weeks = Array.from({ length: WEEKS }, (_, i) => i);
const days = Array.from({ length: DAYS }, (_, i) => i);

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
          left: "18%",
          top: "34%",
          width: "70%",
          height: "70%",
        }}
      >
        {weeks.map((w) =>
          days.map((d) => (
            <IsoCell
              key={`${w}-${d}`}
              left={`${(w * 2.4 + d * 1.2).toFixed(1)}cqw`}
              top={`${(d * 1.4).toFixed(1)}cqw`}
              level={levelAt(w, d)}
            />
          )),
        )}
      </div>

      <div style={{ position: "absolute", top: "4cqh", left: "4cqw", display: "flex", gap: "2.4cqw" }}>
        <div>
          <div style={{ fontSize: "1.1cqw", textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(209,250,229,0.5)" }}>
            Contributions
          </div>
          <div style={{ marginTop: "0.2cqw", fontSize: "2.2cqw", fontWeight: 700, color: "#39d353" }}>1,204</div>
        </div>
        <div>
          <div style={{ fontSize: "1.1cqw", textTransform: "uppercase", letterSpacing: "0.14em", color: "rgba(209,250,229,0.5)" }}>
            Streak
          </div>
          <div style={{ marginTop: "0.2cqw", fontSize: "2.2cqw", fontWeight: 700, color: "#e6edf3" }}>18</div>
        </div>
      </div>
    </div>
  );
}
