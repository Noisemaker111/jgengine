import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { useEngineState } from "@jgengine/react/engineStore";
import { HudCanvas, HudPanel, SettingsTrigger, useHudLayout } from "@jgengine/react";

import type { ContributionStats, GitHubProfile } from "@jgengine/github";
import creditAvatar from "../credit-avatar.jpg";
import { store } from "../store";

const FONT = '"Geist", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const EM = {
  panelBg: "rgba(0, 0, 0, 0.8)",
  panelBorder: "rgba(110, 231, 183, 0.15)",
  title: "#ffffff",
  subtitle: "rgba(209, 250, 229, 0.65)",
  helper: "rgba(209, 250, 229, 0.55)",
  emerald50: "#ecfdf5",
  labelDim: "rgba(209, 250, 229, 0.55)",
  checkboxLabel: "rgba(209, 250, 229, 0.7)",
  hairline: "rgba(209, 250, 229, 0.1)",
  inputBorder: "rgba(209, 250, 229, 0.2)",
  outlineBorder: "rgba(209, 250, 229, 0.25)",
  ring: "rgba(209, 250, 229, 0.2)",
  green: "#34d399",
  statsBoxBg: "rgba(52, 211, 153, 0.05)",
  error: "#fca5a5",
} as const;

const STYLE = `
.cc-panel::-webkit-scrollbar { width: 8px; }
.cc-panel::-webkit-scrollbar-thumb { background: rgba(209, 250, 229, 0.15); }
.cc-input::placeholder { color: rgba(209, 250, 229, 0.4); font-style: italic; }
.cc-input:focus { border-color: rgba(52, 211, 153, 0.6); }
.cc-btn-primary:hover:not(:disabled) { background: #6ee7b7; }
.cc-btn-outline:hover:not(:disabled) { background: rgba(52, 211, 153, 0.1); color: #ecfdf5; }
`;

function DownloadIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx={18} cy={5} r={3} />
      <circle cx={6} cy={12} r={3} />
      <circle cx={18} cy={19} r={3} />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function parseHandle(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/github\.com\/([^/?#\s]+)/i);
  return (match !== null ? match[1]! : trimmed).replace(/^@/, "").trim();
}

function statRows(stats: ContributionStats): Array<[string, string]> {
  return [
    ["Total contributions", stats.total.toLocaleString()],
    ["Active days", `${stats.activeDays} (${stats.activeDaysPct}%)`],
    ["Avg per active day", `${stats.avgPerActiveDay}`],
    ["Avg per week", `${stats.avgPerWeek}`],
    ["Current streak", `${stats.currentStreak} days`],
    ["Longest streak", `${stats.longestStreak} days`],
    ["Peak day", `${stats.peakDay.count} on ${stats.peakDay.label}`],
    ["Busiest weekday", `${stats.busiestWeekday.name} (${stats.busiestWeekday.total})`],
    ["Most active month", `${stats.mostActiveMonth.label} (${stats.mostActiveMonth.total})`],
    ["Last 30 days", stats.last30Days.toLocaleString()],
  ];
}

function drawAnalyticsOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  stats: ContributionStats,
  profile: GitHubProfile | null,
): void {
  const scale = Math.max(0.6, width / 1100);
  const pad = 26 * scale;
  const rows = statRows(stats);
  const lineH = 30 * scale;
  const titleH = 48 * scale;
  const boxW = 380 * scale;
  const boxH = titleH + rows.length * lineH + pad;
  const x = pad;
  const y = pad;
  ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = "rgba(110, 231, 183, 0.25)";
  ctx.lineWidth = Math.max(1, scale);
  ctx.strokeRect(x, y, boxW, boxH);
  ctx.textBaseline = "middle";
  const inset = pad * 0.8;
  ctx.textAlign = "left";
  ctx.fillStyle = EM.emerald50;
  ctx.font = `600 ${21 * scale}px ${FONT}`;
  ctx.fillText(profile !== null ? `@${profile.login}` : "Commit Canopy", x + inset, y + titleH / 2);
  let ry = y + titleH;
  for (const [label, value] of rows) {
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(209, 250, 229, 0.6)";
    ctx.font = `${14 * scale}px ${FONT}`;
    ctx.fillText(label, x + inset, ry + lineH / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = EM.emerald50;
    ctx.font = `600 ${14 * scale}px ${FONT}`;
    ctx.fillText(value, x + boxW - inset, ry + lineH / 2);
    ry += lineH;
  }
  ctx.textAlign = "left";
}

function downloadImage(includeAnalytics: boolean, stats: ContributionStats, profile: GitHubProfile | null): void {
  const source = document.querySelector<HTMLCanvasElement>("canvas[data-engine]");
  if (source === null) return;
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (ctx === null) return;
  ctx.drawImage(source, 0, 0);
  if (includeAnalytics) drawAnalyticsOverlay(ctx, out.width, stats, profile);
  const link = document.createElement("a");
  link.download = `commit-canopy${profile !== null ? `-${profile.login}` : ""}.png`;
  link.href = out.toDataURL("image/png");
  link.click();
}

const inputStyle: CSSProperties = {
  height: 36,
  width: "100%",
  padding: "0 10px",
  fontSize: 13,
  fontFamily: FONT,
  color: "#ffffff",
  background: "transparent",
  border: `1px solid ${EM.inputBorder}`,
  borderRadius: 0,
  outline: "none",
  boxSizing: "border-box",
};

const primaryButtonStyle: CSSProperties = {
  height: 36,
  width: "100%",
  fontSize: 13,
  fontWeight: 500,
  fontFamily: FONT,
  color: "#000000",
  background: EM.green,
  border: "none",
  borderRadius: 0,
  cursor: "pointer",
};

function outlineButtonStyle(disabled: boolean): CSSProperties {
  return {
    height: 36,
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 500,
    fontFamily: FONT,
    color: EM.emerald50,
    background: "transparent",
    border: `1px solid ${EM.outlineBorder}`,
    borderRadius: 0,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  };
}

function StatRow({ label, value, first }: { label: string; value: string; first: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        padding: "8px 0",
        borderTop: first ? "none" : `1px solid ${EM.hairline}`,
      }}
    >
      <span style={{ flexShrink: 0, fontSize: 12, color: EM.labelDim }}>{label}</span>
      <span style={{ textAlign: "right", fontSize: 12, fontWeight: 500, color: EM.emerald50, lineHeight: 1.35 }}>{value}</span>
    </div>
  );
}

function ProfileRow({ profile }: { profile: GitHubProfile | null }) {
  if (profile === null) {
    return <div style={{ fontSize: 12, color: EM.labelDim }}>Look up a GitHub user above.</div>;
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      {profile.avatarUrl !== null ? (
        <img
          src={profile.avatarUrl}
          alt=""
          width={48}
          height={48}
          style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 6, boxShadow: `0 0 0 1px ${EM.ring}` }}
        />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em", color: EM.emerald50, wordBreak: "break-word" }}>
          @{profile.login}
        </span>
        {profile.name !== null ? (
          <span style={{ fontSize: 12, color: EM.labelDim, wordBreak: "break-word" }}>{profile.name}</span>
        ) : null}
      </div>
    </div>
  );
}

function Credit() {
  return (
    <a
      href="https://github.com/radiumcoders/Isometric-Github-Contributions"
      target="_blank"
      rel="noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: "auto",
        paddingTop: 12,
        borderTop: `1px solid ${EM.hairline}`,
        textDecoration: "none",
      }}
    >
      <img
        src={creditAvatar}
        alt="radiumcoders"
        width={26}
        height={26}
        style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 999, boxShadow: `0 0 0 1px ${EM.ring}` }}
      />
      <span style={{ fontSize: 11, lineHeight: 1.4, color: EM.helper }}>
        Inspired by <span style={{ color: EM.green }}>radiumcoders</span>&rsquo; Isometric GitHub Contributions
      </span>
    </a>
  );
}

function Sidebar({ children }: { children: ReactNode }) {
  return (
    <div
      className="cc-panel"
      style={{
        pointerEvents: "auto",
        width: 300,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 16,
        color: "#ffffff",
        background: EM.panelBg,
        border: `1px solid ${EM.panelBorder}`,
        borderRadius: 0,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      {children}
    </div>
  );
}

function GameUIInner() {
  const state = useEngineState(store);
  const layout = useHudLayout({ storageKey: "commit-canopy" });
  const { stats } = state;
  const hoveredCell = state.hovered === null ? null : (state.cells[state.hovered] ?? null);

  const [value, setValue] = useState("");
  const [includeAnalytics, setIncludeAnalytics] = useState(false);
  const [shared, setShared] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const submit = () => void store.loadUser(parseHandle(value));
  const canShare = state.profile !== null;

  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get("u");
    if (u !== null && u.length > 0) void store.loadUser(u);
  }, []);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (store.getState().hovered !== null) setCursor({ x: event.clientX, y: event.clientY });
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const share = () => {
    if (state.profile === null) return;
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = `${base}?u=${encodeURIComponent(state.profile.login)}`;
    void navigator.clipboard.writeText(url).then(() => {
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    });
  };

  return (
    <HudCanvas layout={layout} style={{ fontFamily: FONT }}>
      <style>{STYLE}</style>

      <HudPanel id="sidebar" anchor="top-left" inset={{ x: 16, y: 16 }}>
        <Sidebar>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em", color: EM.title }}>
              Isometric Contribution Graph
            </div>
            <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: EM.subtitle }}>
              Paste a GitHub username or profile link. Shareable URLs look like /theorcdev or /radiumcoders.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input
              className="cc-input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="octocat or https://github.com/octocat"
              spellCheck={false}
              style={inputStyle}
            />
            <button
              type="button"
              className="cc-btn-primary"
              onClick={submit}
              disabled={state.status === "loading"}
              style={{ ...primaryButtonStyle, opacity: state.status === "loading" ? 0.7 : 1 }}
            >
              {state.status === "loading" ? "Loading…" : "Show graph"}
            </button>
            {state.error !== null ? <div style={{ fontSize: 13, color: EM.error }}>{state.error}</div> : null}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: EM.checkboxLabel, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={includeAnalytics}
              onChange={(event) => setIncludeAnalytics(event.target.checked)}
              style={{ width: 16, height: 16, flexShrink: 0, borderRadius: 0, accentColor: EM.green, border: `1px solid ${EM.outlineBorder}` }}
            />
            Include analytics in image
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              className="cc-btn-outline"
              onClick={() => downloadImage(includeAnalytics, stats, state.profile)}
              style={outlineButtonStyle(false)}
            >
              <DownloadIcon />
              Download chart image
            </button>
            <button
              type="button"
              className="cc-btn-outline"
              onClick={share}
              disabled={!canShare}
              style={outlineButtonStyle(!canShare)}
            >
              <ShareIcon />
              {shared ? "Copied" : "Share profile"}
            </button>
          </div>

          <div style={{ fontSize: 11, lineHeight: 1.5, color: EM.helper }}>
            Hover a box for daily count · Drag to rotate · Middle-drag to pan · Scroll to zoom
          </div>

          {state.status === "ready" ? (
            <div style={{ borderTop: `1px solid ${EM.hairline}`, paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <ProfileRow profile={state.profile} />
              <div style={{ display: "flex", flexDirection: "column", padding: "0 10px", borderRadius: 6, border: `1px solid ${EM.hairline}`, background: EM.statsBoxBg }}>
                {statRows(stats).map(([label, statValue], index) => (
                  <StatRow key={label} label={label} value={statValue} first={index === 0} />
                ))}
              </div>
            </div>
          ) : null}

          <Credit />
        </Sidebar>
      </HudPanel>

      <HudPanel id="settings" anchor="top-right" compact="keep">
        <SettingsTrigger className="pointer-events-auto flex h-8 w-8 items-center justify-center border border-[rgba(110,231,183,0.15)] bg-black/80 p-1.5 text-[#34d399] backdrop-blur transition-colors hover:bg-[rgba(52,211,153,0.1)]" />
      </HudPanel>

      {hoveredCell !== null && cursor !== null ? (
        <div
          style={{
            position: "fixed",
            left: cursor.x + 14,
            top: cursor.y + 14,
            pointerEvents: "none",
            padding: "6px 10px",
            fontSize: 12,
            color: EM.emerald50,
            background: EM.panelBg,
            border: `1px solid ${EM.panelBorder}`,
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontWeight: 600 }}>{hoveredCell.count}</span>{" "}
          {hoveredCell.count === 1 ? "contribution" : "contributions"}
          <span style={{ color: EM.labelDim }}> · {hoveredCell.label}</span>
        </div>
      ) : null}
    </HudCanvas>
  );
}

export function GameUI() {
  return <GameUIInner />;
}
