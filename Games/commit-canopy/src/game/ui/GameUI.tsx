import { useState } from "react";

import { useEngineState } from "@jgengine/react/engineStore";
import { AccentRule, HudLabel, HudPanel, KeybindBadge } from "@jgengine/react/gameui/chrome";
import { GameUiThemeProvider, synthwaveTheme, type GameUiTheme } from "@jgengine/react/gameui/theme";

import type { GitHubProfile } from "@jgengine/github";
import { CANOPY_PALETTE } from "../palette";
import { store, type CanopyStatus } from "../store";

const canopyTheme: GameUiTheme = {
  ...synthwaveTheme,
  name: "canopy",
  accent: CANOPY_PALETTE.accent,
  accentGlow: "rgba(57, 211, 83, 0.5)",
  accentDeep: "#0e4429",
  surface: "#101a12",
  surfaceDeep: "#0a0f0b",
  edge: "#1f3a26",
  edgeBright: "#2ea043",
  textPrimary: CANOPY_PALETTE.ink,
  textDim: "#7d8f84",
  fontDisplay: '"Segoe UI", system-ui, sans-serif',
  fontBody: '"Segoe UI", system-ui, sans-serif',
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <HudLabel>{label}</HudLabel>
      <span style={{ fontFamily: canopyTheme.fontNumeric, fontSize: 15, fontWeight: 700, color: CANOPY_PALETTE.ink }}>
        {value}
      </span>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: canopyTheme.fontBody, fontSize: 10, letterSpacing: "0.12em", color: canopyTheme.textDim }}>
        LESS
      </span>
      {CANOPY_PALETTE.levels.map((color, i) => (
        <span key={i} style={{ width: 12, height: 12, background: color, borderRadius: 2, border: "1px solid rgba(255,255,255,0.08)" }} />
      ))}
      <span style={{ fontFamily: canopyTheme.fontBody, fontSize: 10, letterSpacing: "0.12em", color: canopyTheme.textDim }}>
        MORE
      </span>
    </div>
  );
}

function LookupBar({ status, error }: { status: CanopyStatus; error: string | null }) {
  const [value, setValue] = useState("");
  const submit = () => void store.loadUser(value);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          placeholder="GitHub username"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "6px 8px",
            fontSize: 12,
            background: "#0a0f0b",
            color: CANOPY_PALETTE.ink,
            border: `1px solid ${canopyTheme.edge}`,
            outline: "none",
            fontFamily: canopyTheme.fontBody,
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={status === "loading"}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 700,
            background: canopyTheme.accentDeep,
            color: CANOPY_PALETTE.ink,
            border: `1px solid ${canopyTheme.accent}`,
            cursor: status === "loading" ? "default" : "pointer",
            opacity: status === "loading" ? 0.6 : 1,
          }}
        >
          {status === "loading" ? "…" : "Look up"}
        </button>
      </div>
      {error !== null ? <div style={{ marginTop: 6, fontSize: 11, color: "#e0776a" }}>{error}</div> : null}
    </div>
  );
}

function ProfileLine({ profile, source }: { profile: GitHubProfile | null; source: string }) {
  if (profile === null) {
    return (
      <div style={{ fontSize: 12, color: canopyTheme.textDim, marginBottom: 10 }}>
        A year of labour, terraced in emerald.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      {profile.avatarUrl !== null ? (
        <img
          src={profile.avatarUrl}
          alt=""
          width={28}
          height={28}
          style={{ borderRadius: "50%", border: `1px solid ${canopyTheme.edge}` }}
        />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 13, color: CANOPY_PALETTE.ink }}>{profile.name ?? profile.login}</span>
        <span style={{ fontSize: 11, color: canopyTheme.textDim }}>
          @{profile.login}
          {source === "scrape" ? " · scraped" : ""}
        </span>
      </div>
    </div>
  );
}

function GameUIInner() {
  const state = useEngineState(store);
  const { stats } = state;
  const hoveredCell = state.hovered === null ? null : (state.cells[state.hovered] ?? null);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", fontFamily: canopyTheme.fontBody }}>
      <div style={{ position: "absolute", top: 16, left: 16 }}>
        <HudPanel title="Commit Canopy" width={300}>
          <LookupBar status={state.status} error={state.error} />
          <ProfileLine profile={state.profile} source={state.source} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Stat label="Contributions" value={stats.total.toLocaleString()} />
            <Stat label="Active days" value={`${stats.activeDays} (${stats.activeDaysPct}%)`} />
            <Stat label="Avg / active day" value={`${stats.avgPerActiveDay}`} />
            <Stat label="Avg / week" value={`${stats.avgPerWeek}`} />
            <Stat label="Current streak" value={`${stats.currentStreak}d`} />
            <Stat label="Longest streak" value={`${stats.longestStreak}d`} />
            <Stat label="Peak day" value={`${stats.peakDay.count}`} />
            <Stat label="Last 30 days" value={`${stats.last30Days}`} />
            <Stat label="Busiest day" value={`${stats.busiestWeekday.name} (${stats.busiestWeekday.total})`} />
            <Stat label="Top month" value={`${stats.mostActiveMonth.label}`} />
          </div>
          <div style={{ marginTop: 12 }}>
            <AccentRule width="100%" />
          </div>
          <div style={{ marginTop: 10 }}>
            <Legend />
          </div>
        </HudPanel>
      </div>

      <div style={{ position: "absolute", bottom: 20, left: 16 }}>
        <HudPanel width={240}>
          {hoveredCell === null ? (
            <span style={{ fontSize: 12, color: canopyTheme.textDim }}>Hover a day to read its harvest.</span>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 13, color: CANOPY_PALETTE.ink }}>{hoveredCell.label}</span>
              <span style={{ fontFamily: canopyTheme.fontNumeric, fontSize: 15, fontWeight: 700, color: canopyTheme.accent }}>
                {hoveredCell.count} {hoveredCell.count === 1 ? "commit" : "commits"}
              </span>
            </div>
          )}
        </HudPanel>
      </div>

      <div style={{ position: "absolute", bottom: 22, right: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.12em", color: canopyTheme.textDim }}>REGROW THE YEAR</span>
        <KeybindBadge label="R" />
      </div>
    </div>
  );
}

export function GameUI() {
  return (
    <GameUiThemeProvider theme={canopyTheme}>
      <GameUIInner />
    </GameUiThemeProvider>
  );
}
