import { useGameContext } from "@jgengine/react/provider";
import { useEntityStat } from "@jgengine/react/hooks";
import { useEngineState } from "@jgengine/react/engineStore";
import { AccentRule } from "@/components/ui/accent-rule";
import { HudLabel } from "@/components/ui/hud-label";
import { HudPanel } from "@/components/ui/hud-panel";
import { KeybindBadge } from "@/components/ui/keybind-badge";
import { AnnouncementBanner } from "@/components/ui/announcement-banner";
import { GameIcon } from "@jgengine/react/gameIcons";
import { UnitFrame } from "@/components/ui/unit-frame";
import { fieldkitVars } from "@/components/ui/jg-theme";

import { ENEMY_UNITS, type EnemyUnitDef } from "../entities/enemies/catalog";
import { PLAYER_UNITS, PLAYER_ROSTER_ORDER, type PlayerUnitDef } from "../entities/players/catalog";
import { store } from "../battle/controller";
import type { BattleState } from "../battle/store";

function unitDef(catalogId: string): PlayerUnitDef | EnemyUnitDef {
  return PLAYER_UNITS[catalogId] ?? ENEMY_UNITS[catalogId] ?? PLAYER_UNITS.bulwark!;
}

function SelectedUnitPanel({ state }: { state: BattleState }) {
  const unitId = state.selectedUnitId;
  const health = useEntityStat(unitId ?? "", "health");
  if (unitId === null || health === null) return null;
  const catalogId = unitId.startsWith("p:") ? unitId.slice(2) : unitId;
  const def = unitDef(catalogId);
  return (
    <HudPanel title="Selected Unit" width={260}>
      <UnitFrame
        name={def.label}
        vitals={[{ tone: "health", value: { current: health.current, max: health.max, min: health.min } }]}
        portrait={<GameIcon name={def.icon} size={32} color="var(--jg-accent)" />}
      >
        <div style={{ display: "flex", gap: 10, marginTop: 6, fontFamily: "var(--jg-font-numeric)", fontSize: 11, color: "var(--jg-text-dim)" }}>
          <span>MOVE {def.move}</span>
          <span>RNG {def.range}</span>
          <span>DMG {def.damage}</span>
        </div>
      </UnitFrame>
    </HudPanel>
  );
}

function RosterChip({ catalogId }: { catalogId: string }) {
  const state = useEngineState(store);
  const id = `p:${catalogId}`;
  const health = useEntityStat(id, "health");
  const def = PLAYER_UNITS[catalogId]!;
  if (health === null) return null;
  const selected = state.selectedUnitId === id;
  const acted = state.actedIds.includes(id);
  const canAct = state.phase === "player" && !acted;
  return (
    <button
      type="button"
      onClick={() => {
        if (canAct) store.setState({ selectedUnitId: id });
      }}
      disabled={!canAct}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 9px",
        background: selected ? "var(--jg-accent-deep)" : "var(--jg-surface)",
        border: `1px solid ${selected ? "var(--jg-accent)" : "var(--jg-edge)"}`,
        opacity: acted ? 0.45 : 1,
        cursor: canAct ? "pointer" : "default",
      }}
    >
      <GameIcon name={def.icon} size={16} color="var(--jg-text)" />
      <span style={{ fontFamily: "var(--jg-font-numeric)", fontSize: 11, color: "var(--jg-text)" }}>
        {health.current}/{health.max}
      </span>
    </button>
  );
}

function TurnBar({ state }: { state: BattleState }) {
  return (
    <HudPanel width={320}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <HudLabel>{state.waveLabel || "Grid Tactics"}</HudLabel>
        <span style={{ fontFamily: "var(--jg-font-numeric)", fontSize: 12, color: "var(--jg-accent)" }}>ROUND {state.round}</span>
      </div>
      <AccentRule width="100%" />
      <span style={{ fontFamily: "var(--jg-font-display)", fontSize: 12, letterSpacing: "0.12em", color: "var(--jg-text-dim)", textTransform: "uppercase" }}>
        {state.phase === "player" ? "Your Turn" : state.phase === "enemy" ? "Breach Turn" : ""}
      </span>
    </HudPanel>
  );
}

function EndTurnControls({ state }: { state: BattleState }) {
  const ctx = useGameContext();
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {state.selectedUnitId !== null ? (
        <button
          type="button"
          onClick={() => ctx.game.commands.run("battle.wait", {})}
          style={{
            padding: "8px 14px",
            background: "var(--jg-surface)",
            border: `1px solid var(--jg-edge)`,
            color: "var(--jg-text)",
            fontFamily: "var(--jg-font-display)",
            fontSize: 12,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Hold Position
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => ctx.game.commands.run("endTurn", {})}
        disabled={state.phase !== "player"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 16px",
          background: "var(--jg-accent-deep)",
          border: `1px solid var(--jg-accent)`,
          color: "var(--jg-text)",
          fontFamily: "var(--jg-font-display)",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          opacity: state.phase === "player" ? 1 : 0.5,
        }}
      >
        End Turn
        <KeybindBadge label="Enter" size="sm" />
      </button>
    </div>
  );
}

function GameUIInner() {
  const state = useEngineState(store);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", fontFamily: "inherit" }}>
      <div style={{ position: "absolute", top: 16, left: 16, pointerEvents: "auto" }}>
        <TurnBar state={state} />
      </div>
      <div style={{ position: "absolute", top: 16, right: 16, pointerEvents: "auto", display: "flex", gap: 6 }}>
        {PLAYER_ROSTER_ORDER.map((catalogId) => (
          <RosterChip key={catalogId} catalogId={catalogId} />
        ))}
      </div>
      {state.selectedUnitId !== null ? (
        <div style={{ position: "absolute", bottom: 20, left: 16, pointerEvents: "auto" }}>
          <SelectedUnitPanel state={state} />
        </div>
      ) : null}
      <div style={{ position: "absolute", bottom: 20, right: 16, pointerEvents: "auto" }}>
        <EndTurnControls state={state} />
      </div>
      {state.banner !== null ? (
        <div style={{ position: "absolute", top: "16%", left: "50%", transform: "translateX(-50%)" }}>
          <AnnouncementBanner title={state.banner.title} subtitle={state.banner.subtitle} tone={state.banner.tone} />
        </div>
      ) : null}
    </div>
  );
}

export function GameUI() {
  return (
    <div style={{ ...fieldkitVars, display: "contents" }}>
      <GameUIInner />
    </div>
  );
}
