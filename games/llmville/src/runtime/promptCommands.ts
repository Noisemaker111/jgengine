import { useEffect, useRef } from "react";

import type { GameContext } from "@jgengine/core/runtime/gameContext";
import type { PromptCommand } from "@jgengine/core/interaction/proximityPrompt";
import { useGameContext } from "@jgengine/react/provider";
import {
  decodeRackConfigureInput,
  INTERACTION_COMMAND,
  type RackConfigureInput,
} from "@llmville/game/simulation/interaction";
import type { GameMenuRequest } from "@/tablet/tablet";

export function runPromptCommand(ctx: GameContext, descriptor: PromptCommand): boolean {
  return ctx.game.commands.run(descriptor.name, descriptor.input).status === "applied";
}

export function useRackConfigureCommand(openMenu: (menuRequest: GameMenuRequest) => void): void {
  const ctx = useGameContext();
  const openMenuRef = useRef(openMenu);

  useEffect(() => {
    openMenuRef.current = openMenu;
  }, [openMenu]);

  useEffect(() => {
    if (ctx.game.commands.has(INTERACTION_COMMAND.rackConfigure)) return;
    ctx.game.commands.define<RackConfigureInput>(INTERACTION_COMMAND.rackConfigure, {
      decode: decodeRackConfigureInput,
      apply: (_state, input) => {
        openMenuRef.current({ type: "rack-config", rackId: input.rackId });
      },
    });
  }, [ctx]);
}
