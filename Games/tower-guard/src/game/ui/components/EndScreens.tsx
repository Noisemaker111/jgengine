import { useGameStore } from "@jgengine/react/hooks";
import { DeathScreenView, ResultsScreen } from "@jgengine/react/gameui";

import { GOLD_CURRENCY } from "../../entities/base/catalog";
import { TOTAL_WAVES } from "../../waves/manifest";
import { session } from "../../session";

export function EndScreens() {
  const gameOver = useGameStore(() => session.gameOver);
  const victory = useGameStore(() => session.victory);
  const gold = useGameStore((ctx) => ctx.game.economy.balance(ctx.player.userId, GOLD_CURRENCY));

  if (gameOver) {
    return <DeathScreenView title="The Keep Has Fallen" subtitle="The raiders broke through every watchtower." />;
  }

  if (victory) {
    return (
      <ResultsScreen
        outcome="victory"
        title="The Keep Holds"
        lines={[
          { label: "Waves Survived", value: TOTAL_WAVES, accent: true },
          { label: "Gold Remaining", value: gold },
        ]}
      />
    );
  }

  return null;
}
