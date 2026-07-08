import { useGameStore } from "@jgengine/react/hooks";
import { HeartRow } from "@/components/ui/heart-row";
import { WaveIndicator } from "@/components/ui/wave-indicator";
import { WalletCurrencyDisplay } from "@/components/ui/wallet-currency-display";
import { HudLabel } from "@/components/ui/hud-label";

import { BASE_ENTITY_ID, GOLD_CURRENCY, STARTING_LIVES } from "../../entities/base/catalog";
import { TOTAL_WAVES } from "../../waves/manifest";
import { activeCreepCount, currentWaveNumber } from "../../session";

export function Hud() {
  const lives = useGameStore((ctx) => ctx.scene.entity.stats.get(BASE_ENTITY_ID, "lives"));
  const wave = useGameStore(() => currentWaveNumber());
  const remaining = useGameStore(() => activeCreepCount());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <HudLabel>Keep</HudLabel>
        <HeartRow current={lives?.current ?? 0} max={lives?.max ?? STARTING_LIVES} size={18} />
      </div>
      <WalletCurrencyDisplay currencyId={GOLD_CURRENCY} name="Gold" />
      <WaveIndicator wave={Math.min(wave, TOTAL_WAVES)} totalWaves={TOTAL_WAVES} remaining={remaining} remainingLabel="raiders" />
    </div>
  );
}
