import type { ReactNode } from "react";

import type { ViewportDef, ViewportsConfig } from "@jgengine/core/game/viewports";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { localPlayers, type LocalPlayerSlot } from "@jgengine/core/runtime/localPlayers";

import { useSeatViewports } from "@jgengine/shell/camera/Viewports";

/**
 * One absolutely-positioned HUD root per viewport, laid over the canvas: render each seat's own
 * health, prompts or score with `children(slot)`. Pass the same `viewports` config the game gave `defineGame`.
 * @capability split-screen-hud Per-seat HUD roots positioned over each split-screen viewport.
 */
export function ViewportHuds({
  ctx,
  config,
  children,
}: {
  ctx: GameContext;
  config?: ViewportsConfig;
  children: (slot: LocalPlayerSlot, viewport: ViewportDef) => ReactNode;
}) {
  const viewports = useSeatViewports(ctx, config);
  const seats = localPlayers(ctx);
  return (
    <>
      {viewports.map((viewport) => {
        const slot = seats.slot(viewport.slot);
        if (slot === null) return null;
        const [x, y, width, height] = viewport.rect;
        return (
          <div
            key={viewport.slot}
            data-jg-viewport={viewport.slot}
            className="pointer-events-none absolute overflow-hidden"
            style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` }}
          >
            {children(slot, viewport)}
          </div>
        );
      })}
    </>
  );
}
