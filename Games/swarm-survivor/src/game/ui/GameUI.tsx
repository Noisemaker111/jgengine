import { useEffect, useState, useSyncExternalStore } from "react";
import { useAbilitySlots, useEntityStat } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import {
  AbilitySlotButton,
  DeathScreenView,
  GameIcon,
  GameUiThemeProvider,
  HudPanel,
  MatchTimer,
  MenuButton,
  ResultsScreen,
  ScoreReadout,
  VitalBar,
  XpBar,
  type AbilitySlotButtonState,
  type GameUiTheme,
} from "@jgengine/react/gameui";
import type { AbilitySlotState } from "@jgengine/core/combat/abilityKit";

import type { WeaponId } from "../items/weapons/catalog";
import { chooseUpgrade } from "../run/simulation";
import { WIN_DURATION_SECONDS, getRunState } from "../run/state";

const swarmTheme: GameUiTheme = {
  name: "swarm",
  accent: "#7fe36b",
  accentGlow: "rgba(127, 227, 107, 0.5)",
  accentDeep: "#2f7d38",
  surface: "#0f1810",
  surfaceDeep: "#070c08",
  edge: "#2a3f27",
  edgeBright: "#4c6a45",
  textPrimary: "#e8f5e2",
  textDim: "#8fa688",
  health: "#e0483e",
  healthDeep: "#6e211c",
  mana: "#4a86d8",
  manaDeep: "#20406f",
  stamina: "#d9c33f",
  staminaDeep: "#6e621c",
  xp: "#a566d9",
  xpDeep: "#4e2c6e",
  shield: "#9fb9c9",
  shieldDeep: "#48606e",
  danger: "#e0483e",
  warning: "#e8a33d",
  success: "#7fe36b",
  hostile: "#e0483e",
  friendly: "#2fb7c4",
  neutral: "#d9c33f",
  rarity: {
    common: "#b4b2a8",
    uncommon: "#7fb84a",
    rare: "#4a86d8",
    epic: "#a04fd0",
    legendary: "#e0862e",
  },
  fontDisplay: '"Segoe UI", system-ui, sans-serif',
  fontNumeric: 'Consolas, "Cascadia Mono", "SF Mono", "Roboto Mono", monospace',
  fontBody: '"Segoe UI", system-ui, sans-serif',
};

const WEAPON_ICON: Record<WeaponId, "spear" | "sword" | "lightning"> = {
  pulseLance: "spear",
  rotorBlades: "sword",
  quakePulse: "lightning",
};

function useTick(intervalMs: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}

function useRunPhase(): string {
  const ctx = useGameContext();
  const run = getRunState(ctx);
  return useSyncExternalStore(
    run.subscribe,
    () => `${run.outcome}:${run.pendingOffers?.map((offer) => offer.id).join(",") ?? ""}`,
  );
}

function toButtonState(state: AbilitySlotState): AbilitySlotButtonState {
  switch (state) {
    case "no-resource":
      return "noResource";
    case "just-cast":
      return "ready";
    case "cooldown":
      return "cooldown";
    case "ready":
      return "ready";
  }
}

function WeaponBar() {
  const ctx = useGameContext();
  const run = getRunState(ctx);
  const slots = useAbilitySlots(run.weaponKit);
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {slots.map((slot) => (
        <AbilitySlotButton
          key={slot.id}
          icon={<GameIcon name={WEAPON_ICON[slot.id as WeaponId]} size={22} />}
          size={50}
          state={toButtonState(slot.state)}
          cooldownFraction={slot.cooldownFraction}
          justCast={slot.justCast}
        />
      ))}
    </div>
  );
}

function UpgradeModal() {
  const ctx = useGameContext();
  const run = getRunState(ctx);
  const offers = run.pendingOffers;
  if (offers === null) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4,10,5,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 20,
      }}
    >
      <HudPanel title="Choose an Upgrade" width={620}>
        <div style={{ display: "flex", gap: 14 }}>
          {offers.map((offer) => (
            <div
              key={offer.id}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "center",
                padding: 14,
                border: "1px solid #2a3f27",
              }}
            >
              <span
                style={{
                  fontFamily: swarmTheme.fontDisplay,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: swarmTheme.accent,
                  textAlign: "center",
                }}
              >
                {offer.label}
              </span>
              <MenuButton label="Select" onActivate={() => chooseUpgrade(ctx, run, offer.id)} />
            </div>
          ))}
        </div>
      </HudPanel>
    </div>
  );
}

export function GameUI() {
  const ctx = useGameContext();
  const run = getRunState(ctx);
  useRunPhase();
  useTick(200);
  const health = useEntityStat(ctx.player.userId, "health");
  const xp = useEntityStat(ctx.player.userId, "xp");
  const level = useEntityStat(ctx.player.userId, "level");
  const remaining = Math.max(0, WIN_DURATION_SECONDS - ctx.time.now());

  return (
    <GameUiThemeProvider theme={swarmTheme}>
      {run.outcome === "lost" && <DeathScreenView title="Overrun" subtitle="The swarm closed in." />}
      {run.outcome === "won" && (
        <ResultsScreen
          outcome="victory"
          title="Extraction Successful"
          lines={[
            { label: "Survived", value: `${WIN_DURATION_SECONDS}s`, accent: true },
            { label: "Kills", value: run.kills },
            { label: "Level", value: level?.current ?? 1 },
          ]}
        />
      )}
      {run.outcome === "playing" && (
        <>
          <UpgradeModal />
          <div style={{ position: "fixed", top: 18, left: 18 }}>
            {health !== null && <VitalBar value={health} tone="health" label="Hull" width={220} />}
          </div>
          <div
            style={{
              position: "fixed",
              top: 18,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <MatchTimer seconds={remaining} label="Survive" />
            {xp !== null && <XpBar fraction={(xp.current - xp.min) / Math.max(1, xp.max - xp.min)} level={level?.current} width={220} />}
          </div>
          <div style={{ position: "fixed", top: 18, right: 18 }}>
            <ScoreReadout value={run.kills} digits={3} label="Kills" />
          </div>
          <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)" }}>
            <WeaponBar />
          </div>
        </>
      )}
    </GameUiThemeProvider>
  );
}
