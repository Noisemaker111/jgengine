import type { AbilitySlotState as CoreSlotState } from "@jgengine/core/combat/abilityKit";
import { GameIcon, isGameIconName } from "@jgengine/react/gameIcons";
import type { CartridgePanels } from "@jgengine/shell/cartridge";

import { AbilitySlotButton, type AbilitySlotState as ButtonSlotState } from "@/components/ui/ability-slot";
import { DeathScreenView } from "@/components/ui/death-screen-view";
import { HudPanel } from "@/components/ui/hud-panel";
import { MatchTimer } from "@/components/ui/match-timer";
import { MenuButton } from "@/components/ui/menu-button";
import { ResultsScreen } from "@/components/ui/results-screen";
import { ScoreReadout } from "@/components/ui/score-readout";
import { VitalBar, type VitalTone } from "@/components/ui/vital-bar";
import { XpBar } from "@/components/ui/xp-bar";

function toButtonState(state: CoreSlotState): ButtonSlotState {
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

const VITAL_TONES: readonly VitalTone[] = ["health", "mana", "stamina", "xp", "shield"];

function vitalTone(tone: string | undefined): VitalTone {
  return VITAL_TONES.find((known) => known === tone) ?? "health";
}

export const standardCartridgePanels: CartridgePanels = {
  Vital: ({ value, label, tone, width }) => (
    <VitalBar value={value} tone={vitalTone(tone)} label={label} width={width} />
  ),
  Xp: ({ fraction, level, width }) => <XpBar fraction={fraction} level={level} width={width} />,
  Timer: ({ seconds, label }) => <MatchTimer seconds={seconds} label={label} />,
  Score: ({ value, label, digits }) => <ScoreReadout value={value} label={label} digits={digits} />,
  AbilityBar: ({ slots }) => (
    <div style={{ display: "flex", gap: 10 }}>
      {slots.map((slot) => (
        <AbilitySlotButton
          key={slot.id}
          icon={isGameIconName(slot.icon) ? <GameIcon name={slot.icon} size={22} /> : slot.icon}
          size={50}
          state={toButtonState(slot.state)}
          cooldownFraction={slot.cooldownFraction}
          justCast={slot.justCast}
        />
      ))}
    </div>
  ),
  DraftModal: ({ offers, choose }) => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.72)",
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
                border: "1px solid var(--jg-edge)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--jg-font-display)",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--jg-accent)",
                  textAlign: "center",
                }}
              >
                {offer.label}
              </span>
              <MenuButton label="Select" onActivate={() => choose(offer.id)} />
            </div>
          ))}
        </div>
      </HudPanel>
    </div>
  ),
  WinScreen: ({ title, lines }) => <ResultsScreen outcome="victory" title={title} lines={lines} />,
  LoseScreen: ({ title, subtitle }) => <DeathScreenView title={title} subtitle={subtitle} />,
};
