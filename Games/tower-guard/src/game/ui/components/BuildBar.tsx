import { useGame, useGameStore } from "@jgengine/react/hooks";
import { AbilitySlotButton, GameIcon, HudLabel, useGameUiTheme } from "@jgengine/react/gameui";
import { actionLabel } from "@jgengine/core/input/actionBindings";

import { GOLD_CURRENCY } from "../../entities/base/catalog";
import { TOWER_IDS, towerDef } from "../../entities/towers/catalog";
import { keybinds } from "../../keybinds";
import { session } from "../../session";

export function BuildBar() {
  const theme = useGameUiTheme();
  const { commands } = useGame();
  const gold = useGameStore((ctx) => ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY));
  const selected = useGameStore(() => session.selectedTowerId);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <HudLabel>Build</HudLabel>
      <div style={{ display: "flex", gap: 10 }}>
        {TOWER_IDS.map((id, index) => {
          const def = towerDef(id);
          const affordable = gold >= def.cost;
          const isSelected = selected === id;
          return (
            <div
              key={id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: 3,
                borderRadius: 4,
                boxShadow: isSelected ? `0 0 0 2px ${theme.accent}` : "none",
              }}
            >
              <AbilitySlotButton
                icon={<GameIcon name={def.icon} size={26} />}
                keybind={actionLabel(keybinds, `buildTower${index + 1}`) ?? undefined}
                state={affordable ? "ready" : "noResource"}
                size={50}
                onActivate={() => commands.run(`buildTower${index + 1}`, {})}
              />
              <span
                style={{
                  fontFamily: theme.fontNumeric,
                  fontSize: 12,
                  fontWeight: 700,
                  color: affordable ? theme.textPrimary : theme.danger,
                }}
              >
                {def.cost}g
              </span>
              <span
                style={{
                  fontFamily: theme.fontDisplay,
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: theme.textDim,
                }}
              >
                {def.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
