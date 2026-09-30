import { useState, type CSSProperties } from "react";
import { useGame, useGameContext, useGameStoreValue } from "@jgengine/react";
import type { PlayableGame } from "@jgengine/shell/registry";
import type { GameSettingDef } from "@jgengine/core/settings/settingsModel";
import { SettingsTrigger, useSetting } from "@jgengine/react/settings";
import { authorityContent, authorityDefinition, authorityLoop, type AuthorityView } from "./hostedAuthority";

const buttonStyle: CSSProperties = { padding: "12px 18px", border: "1px solid #6faaa7", borderRadius: 8, background: "#193b40", color: "#e9f6ee", fontWeight: 600, cursor: "pointer" };

const READOUT_STYLE_ID = "relay.readoutStyle";
const displaySettings: readonly GameSettingDef[] = [{
  id: READOUT_STYLE_ID, label: "Readout style", category: "gameplay", kind: "select", default: "detailed",
  options: [{ value: "detailed", label: "Detailed" }, { value: "compact", label: "Compact" }],
}];

function AuthorityUI() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const view = useGameStoreValue<AuthorityView | null>(`relay.view:${ctx.player.userId}`, null);
  const [result, setResult] = useState("Awaiting a command");
  const [readoutStyle] = useSetting<"detailed" | "compact">(READOUT_STYLE_ID, "detailed");
  const compact = readoutStyle === "compact";
  async function run(name: string) {
    setResult(`Sending ${name}`);
    const outcome = await commands.run(name, {});
    setResult(outcome.status === "rejected" ? `${name}: ${outcome.reason}` : `${name}: ${outcome.status}`);
  }
  return <main data-readout-style={readoutStyle} style={{ pointerEvents: "auto", minHeight: "100%", background: "radial-gradient(ellipse at 70% 10%, #24535a, #101d2d 70%)", color: "#e9f6ee", padding: "40px 6vw", fontFamily: "system-ui" }}>
    <header style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width="78" height="78" viewBox="0 0 80 80" aria-label="Relay signal crest"><path d="M40 8 68 24v32L40 72 12 56V24Z" fill="#15373d" stroke="#dda45a" strokeWidth="2"/><path d="M24 42q16-24 32 0M30 48q10-15 20 0" fill="none" stroke="#95d4bc" strokeWidth="4" strokeLinecap="round"/><circle cx="40" cy="54" r="4" fill="#dda45a"/></svg>
      <div><p style={{ color: "#95d4bc", margin: 0 }}>JG ENGINE · SHARED AUTHORITY</p><h1 style={{ margin: "6px 0", fontSize: 34 }}>Relay Courtyard</h1><p style={{ margin: 0 }}>Send a signal. Keep your progress across a host restart.</p></div>
    </header>
    <SettingsTrigger className="mt-5 rounded-lg border border-[#6faaa7] px-4 py-2 text-sm font-semibold" label="Display settings">Display settings</SettingsTrigger>
    <p>Actor <strong data-testid="actor">{ctx.player.userId}</strong> · <span data-testid="members">{view?.members ?? 0}</span> couriers connected</p>
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, margin: "28px 0" }}>
      {([ ["Copper", view?.coins], ["XP", view?.xp], ["Tokens", view?.loot], ["Signals", view?.casts], ["Host time", view?.time], ["Host tick", view?.ticks] ] as const).map(([label, value]) => <div key={label} style={{ border: "1px solid #41606a", padding: compact ? 12 : 20, borderRadius: 12, background: "#102735" }}><div style={{ color: "#aac5c9", fontSize: 13 }}>{label}</div><output data-testid={label.toLowerCase().replaceAll(" ", "-")} style={{ display: "block", fontSize: compact ? 22 : 30 }}>{value ?? "—"}</output></div>)}
    </section>
    <section style={{ borderLeft: "3px solid #dda45a", padding: "8px 20px", marginBottom: 24 }}>
      <p>First signal: <strong data-testid="quest">{view?.quest ?? "available"}</strong> · <span data-testid="progress">{view?.progress ?? 0}</span>/1</p>
      <p>Target: <span data-testid="target">{view?.target ?? "none"}</span> · Cooldown: <output data-testid="cooldown">{Math.max(0, (view?.cooldownUntil ?? 0) - (view?.time ?? 0)).toFixed(1)}</output>s</p>
      <p>Respawn: <output data-testid="respawn">{Math.max(0, (view?.respawnAt ?? 0) - (view?.time ?? 0)).toFixed(1)}</output>s · Pose: <output data-testid="pose">{view?.position.map((value) => value.toFixed(2)).join(", ") ?? "—"}</output></p>
    </section>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {([ ["Choose courier · 3 copper", "class.choose"], ["Accept first signal", "quest.accept"], ["Select signal", "target.cycle"], ["Send signal · Space", "cast"], ["Turn in signal", "quest.turnIn"], ["Practice respawn", "down"] ] as const).map(([label, command]) => <button key={command} style={buttonStyle} onClick={() => { void run(command); }}>{label}</button>)}
    </div>
    <p role="status" data-testid="command-result" style={{ color: "#dda45a", minHeight: 26 }}>{result}</p>
    <p style={{ color: "#aac5c9" }}>WASD moves your courier. Space sends the selected signal. Commands and timers belong to the host.</p>
    <footer style={{ marginTop: 32, fontSize: 12, color: "#aac5c9" }}>Original signal crest and interface by JG Engine. Engine fixture; anonymous throwaway realm.<br/>Frontend build: <span data-testid="frontend-revision">{import.meta.env.VITE_JG_COMPILED_REVISION ?? "development"}</span></footer>
  </main>;
}

export const hostedAuthorityDemoGame: PlayableGame = {
  game: authorityDefinition, content: authorityContent, presentation: "hud", GameUI: AuthorityUI,
  settings: { extra: displaySettings, categories: [{ id: "gameplay", label: "Display" }], hide: ["sound", "graphics", "controls"] },
  loop: { onInit: authorityLoop.onInit!, onNewPlayer: authorityLoop.onNewPlayer!, onTick: authorityLoop.onTick!, onReset: () => {}, onDispose: () => {} },
};
