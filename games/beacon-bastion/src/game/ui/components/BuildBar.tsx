import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import { GameFrame } from "@jgengine/react/gameFrame";
import { GameIcon } from "@jgengine/react/gameIcons";
import { HudFade } from "@jgengine/react/hudFade";
import { actionLabel } from "@jgengine/core/input/actionBindings";

import { buildPrompt } from "../../build/prompt";
import { editorLayers } from "../../../editorLayers";
import { TOWER_IDS, towerDef } from "../../entities/towers/catalog";
import { keybinds } from "../../keybinds";
import { buildCost, keep } from "../../keep";
import { session } from "../../session";
import { FIRE } from "../theme";

/**
 * The builder's rack along the bottom edge: one timber plaque per tower with its glyph, its price
 * on a coin and the key that picks it. A plaque the purse cannot cover goes dark and its price
 * turns red; the chosen one is lit by the beacon. The rack steps back between decisions.
 */
export function BuildBar() {
  const { commands } = useGame();
  const gameCtx = useGameContext();
  const gold = useGameStore((ctx) => keep.of(ctx).num("keep.gold"));
  const selected = useGameStore(() => session.selectedTowerId);
  const selectedAffordable = selected !== null && gold >= buildCost(selected);
  // Builds under way, from the keep's build queue: what is rising and how far along it is.
  const building = useGameStore((ctx) =>
    keep.of(ctx).orders("build").map((order) => `${order.label} ${Math.round(order.progress * 100)}%`).join(" · "),
  );

  return (
    <HudFade watch={[gold, selected, building]} hold={selected !== null || building.length > 0} dimTo={0.55} idleMs={6000}>
      <div className="bb-rack">
        <span className="bb-rack-prompt">{building.length > 0 ? `Raising ${building}` : buildPrompt(selected !== null, selectedAffordable)}</span>
        <div className="bb-rack-row">
          {TOWER_IDS.map((id, index) => {
            const def = towerDef(id, editorLayers);
            const cost = buildCost(id);
            const affordable = gold >= cost;
            const isSelected = selected === id;
            const key = actionLabel(keybinds, `buildTower${index + 1}`);
            return (
              <GameFrame
                key={id}
                as="button"
                material="wood"
                cut="notch"
                depth={10}
                padding="8px 10px 7px"
                tint={affordable ? undefined : "#3f2a1a"}
                edge={isSelected ? FIRE : undefined}
                glow={isSelected ? "rgba(255,160,60,0.7)" : undefined}
                className="bb-plaque"
                data-state={isSelected ? "chosen" : affordable ? "ready" : "short"}
                aria-label={`${def.label}, ${cost} gold`}
                aria-pressed={isSelected}
                onClick={() => {
                  commands.run(`buildTower${index + 1}`, {});
                  // The plaque is already dark when unaffordable; pressing it anyway plays the denied cue.
                  if (!affordable) gameCtx.game.audio.play("denied");
                }}
              >
                {key === null ? null : <span className="bb-plaque-key">{key}</span>}
                <GameIcon name={def.icon} size={30} color={affordable ? "#fff3df" : "#a8927a"} />
                <span className="bb-plaque-name">{def.label}</span>
                <span className="bb-plaque-cost" data-short={affordable ? undefined : ""}>
                  <GameIcon name="coin" size={12} color={affordable ? "#f6cf5a" : "#e0624a"} />
                  {cost}
                </span>
              </GameFrame>
            );
          })}
        </div>
      </div>
    </HudFade>
  );
}
