import { useEffect, useState } from "react";

import { createGameContext, type GameContext } from "@jgengine/core/runtime/gameContext";
import { useAccessibilitySettings } from "@jgengine/core/settings/accessibilitySettings.view";
import { GameProvider } from "@jgengine/react/provider";
import { HudThemeRoot } from "@jgengine/core/hud/hudThemeRoot.view";
import { HudViewportProvider } from "@jgengine/core/hud/hudViewport.view";

import type { PlayableGame } from "./registry";
import { contextModels } from "@jgengine/core/model/resolveModel";

export type UiPreviewScenario = (ctx: GameContext, playable: PlayableGame) => void;

const PREVIEW_USER_ID = "ui-preview";
const TICK_STEP = 1 / 60;

function runTicks(ctx: GameContext, playable: PlayableGame, seconds: number): void {
  const steps = Math.round(seconds / TICK_STEP);
  for (let index = 0; index < steps; index += 1) {
    playable.loop.onTick(ctx, TICK_STEP);
  }
}

export const defaultUiScenario: UiPreviewScenario = (ctx, playable) => {
  runTicks(ctx, playable, 4);

  if (ctx.game.commands.has("target.cycle")) ctx.game.commands.run("target.cycle", {});
  else ctx.scene.entity.cycleTarget(PREVIEW_USER_ID, { filter: "hostile" });

  const declarations = Object.entries(playable.game.inventories ?? {});
  const hotbarId = (declarations.find(([, declaration]) => declaration.hud === "hotbar") ??
    declarations[0])?.[0];
  if (hotbarId !== undefined) {
    const slots = ctx.player.inventory.state(hotbarId).slots;
    const slot = slots.findIndex((stack) => stack !== null && stack !== undefined);
    if (slot >= 0) {
      ctx.item.use.use({
        from: PREVIEW_USER_ID,
        itemId: slots[slot]!.itemId,
        inventoryId: hotbarId,
        aim: { yaw: 0, pitch: 0 },
      });
    }
  }

  runTicks(ctx, playable, 0.5);
};

export function GameUiPreview({
  playable,
  scenario = defaultUiScenario,
}: {
  playable: PlayableGame;
  scenario?: UiPreviewScenario | undefined;
}) {
  const [ctx, setCtx] = useState<GameContext | null>(null);
  const accessibility = useAccessibilitySettings();

  useEffect(() => {
    const models = contextModels(playable);
    const context = createGameContext({
      definition: playable.game,
      content: playable.content,
      player: { userId: PREVIEW_USER_ID, isNew: true },
      ...(models === undefined ? {} : { models }),
    });
    playable.loop.onInit(context);
    playable.loop.onNewPlayer(context);
    try {
      scenario(context, playable);
    } catch (error) {
      console.error("[jgengine:ui-preview] scenario failed", error);
    }
    setCtx(context);
    return () => {
      setCtx(null);
    };
  }, [playable, scenario]);

  if (ctx === null) return <div className="h-full w-full bg-neutral-900" />;

  const GameUI = playable.GameUI;
  return (
    <div
      data-ui-preview-ready
      className="relative h-full w-full overflow-hidden"
      style={{ background: "linear-gradient(180deg, #2a3d33 0%, #1a2320 55%, #141b18 100%)" }}
    >
      <GameProvider context={ctx}>
        <HudViewportProvider platforms={playable.controls?.platforms} config={playable.controls?.hudFit}>
          <HudThemeRoot theme={playable.hudTheme} accessibility={accessibility}>
            <GameUI />
          </HudThemeRoot>
        </HudViewportProvider>
      </GameProvider>
    </div>
  );
}
