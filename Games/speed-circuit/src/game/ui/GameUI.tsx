import { useSyncExternalStore } from "react";
import { ArcGauge, CountdownPips, GameUiThemeProvider, HudLabel, KeybindBadge, ResultsScreen, synthwaveTheme, useGameUiTheme } from "@jgengine/react/gameui";

import { runStore } from "../../loop";
import { formatRaceTime } from "../race/runState";

const TOP_SPEED_KMH = 34 * 3.6;

function TimeReadout({ label, seconds }: { label: string; seconds: number | null }) {
  const theme = useGameUiTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <HudLabel>{label}</HudLabel>
      <span
        style={{
          fontFamily: theme.fontNumeric,
          fontSize: 22,
          fontWeight: 800,
          color: theme.textPrimary,
          textShadow: "0 1px 2px rgba(0,0,0,0.9)",
        }}
      >
        {seconds === null ? "--:--" : formatRaceTime(seconds)}
      </span>
    </div>
  );
}

function HudLayer() {
  const theme = useGameUiTheme();
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
                fontFamily: theme.fontDisplay,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: theme.warning,
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
                <span style={{ fontFamily: theme.fontBody, fontSize: 12, color: theme.textDim }}>{label}</span>
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
            <span style={{ fontFamily: theme.fontBody, fontSize: 12, color: theme.textDim }}>Race again</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function GameUI() {
  return (
    <GameUiThemeProvider theme={synthwaveTheme}>
      <HudLayer />
    </GameUiThemeProvider>
  );
}
