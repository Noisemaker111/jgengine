import { GameResourcePanel } from "@/runtime/components/GameResourcePanel";
import type { WorldViewModel } from "@/runtime/worldState";

interface GameHudBarProps {
  world: WorldViewModel;
  className?: string;
}

/** Desktop HUD: cash/tokens top-left. */
export function GameHudBar({ world, className }: GameHudBarProps) {
  return (
    <GameResourcePanel
      money={world.money}
      dataTokens={world.dataTokens}
      servingIncomeRate={world.servingIncomeRate}
      className={className}
    />
  );
}
