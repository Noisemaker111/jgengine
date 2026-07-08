import { useSyncExternalStore } from "react";
import { ArcGauge } from "@/components/ui/arc-gauge";
import { CountdownPips } from "@/components/ui/match-timer";
import { HudLabel } from "@/components/ui/hud-label";
import { KeybindBadge } from "@/components/ui/keybind-badge";
import { ResultsScreen } from "@/components/ui/results-screen";
import { synthwaveVars } from "@/components/ui/jg-theme";

import { runStore } from "../../loop";
import { formatRaceTime } from "../race/runState";

const TOP_SPEED_KMH = 34 * 3.6;

function TimeReadout({ label, seconds }: { label: string; seconds: number | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <HudLabel>{label}</HudLabel>
      <span
        style={{
          fontFamily: "var(--jg-font-numeric)",
          fontSize: 22,
          fontWeight: 800,
          color: "var(--jg-text)",
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
        }}
      >
        {seconds === null ? "--:--" : formatRaceTime(seconds)}
      </span>
    </div>
  );
}

function HudLayer() {
  const state = useSyncExternalStore(runStore.subscribe, runStore.getState);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
      {state.phase !== "finished" && (
        <div style={{ position: "absolute", top: 20, left: 20 }}>
          <ArcGauge
            fraction={state.speedKmh / TOP_SPEED_KMH}
            label="KM/H"
            readout={String(Math.round(state.speedKmh))}
            tone={state.offTrack ? "warning" : "accent"}
          />
        </div>
      )}

      {state.phase !== "finished" && (
        <div
          style={{
            position: "absolute",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <HudLabel>
            Lap {state.lap}/{state.laps}
          </HudLabel>
          <div style={{ display: "flex", gap: 28 }}>
            <TimeReadout label="Time" seconds={state.currentLapTime} />
            <TimeReadout label="Best" seconds={state.bestLapTime} />
          </div>
          {state.offTrack && (
            <span
              style={{
                fontFamily: "var(--jg-font-display)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--jg-warning)",
                animation: "jgui-pulse 0.8s infinite",
              }}
            >
              Off Track
            </span>
          )}
        </div>
      )}

      {state.phase === "countdown" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 22,
          }}
        >
          <CountdownPips value={state.countdown} />
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
            {[
              ["W", "Accelerate"],
              ["S", "Brake"],
              ["A/D", "Steer"],
              ["Space", "Handbrake"],
            ].map(([key, label]) => (
              <span key={key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <KeybindBadge label={key!} />
                <span style={{ fontFamily: "var(--jg-font-body)", fontSize: 12, color: "var(--jg-text-dim)" }}>{label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {state.phase === "finished" && (
        <div style={{ pointerEvents: "auto" }}>
          <ResultsScreen
            outcome="victory"
            title="Race Complete"
            lines={[
              { label: "Total Time", value: formatRaceTime(state.totalTime), accent: true },
              { label: "Best Lap", value: state.bestLapTime === null ? "--:--" : formatRaceTime(state.bestLapTime) },
            ]}
          />
          <div
            style={{
              position: "absolute",
              bottom: 48,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <KeybindBadge label="R" />
            <span style={{ fontFamily: "var(--jg-font-body)", fontSize: 12, color: "var(--jg-text-dim)" }}>Race again</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function GameUI() {
  return (
    <div style={{ ...synthwaveVars, display: "contents" }}>
      <HudLayer />
    </div>
  );
}
