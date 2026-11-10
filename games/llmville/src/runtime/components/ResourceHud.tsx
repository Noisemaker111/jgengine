/** @jsxImportSource @jgengine/core/ui/jsx */
import { TweenNumber } from "@jgengine/core/anim/tweenNumber.view";
import { KitCount, KitCounts } from "@jgengine/core/hud/kitHud.view";
import { KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";
import { servingIncomePerHour } from "@llmville/game/economy/hourlyRates";

import { formatCompactNumber, formatMoney } from "../../economy/economy";

interface ResourceHudProps {
  money: number;
  dataTokens: number;
  servingIncomeRate: number;
}

/** Cash, data tokens and serving income: the play HUD's top-left readout. */
export function ResourceHud({ money, dataTokens, servingIncomeRate }: ResourceHudProps) {
  const incomePerHour = servingIncomePerHour(servingIncomeRate);
  return (
    <KitPanel as="div" className="llm-resources" data-ui-layer="resource-panel">
      <KitCounts>
        <KitCount
          id="cash"
          label="Cash"
          value={<TweenNumber value={money} format={(value) => `$${formatMoney(value)}`} />}
          detail={incomePerHour > 0 ? `▲ +$${formatMoney(incomePerHour)} / hr` : undefined}
        />
        <KitCount id="tokens" label="Tokens" value={<TweenNumber value={dataTokens} format={formatCompactNumber} />} />
      </KitCounts>
    </KitPanel>
  );
}
