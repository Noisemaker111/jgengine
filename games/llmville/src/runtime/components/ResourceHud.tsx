/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo } from "@jgengine/core/ui/jsx";
import { bind, runeTween } from "@jgengine/core/ui/rune/primitives";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { servingIncomePerHour } from "@llmville/game/economy/hourlyRates";

import { formatCompactNumber, formatMoney } from "../../economy/economy";
import { C, Label, Panel, Row, Text } from "../../ui/kit";
import { DISPLAY } from "../../ui/theme";

interface ResourceHudProps {
  money: () => number;
  dataTokens: () => number;
  servingIncomeRate: () => number;
}

/** Cash, data tokens and serving income: the play HUD's top-left readout. Counts tween at their leaves. */
export function ResourceHud({ money, dataTokens, servingIncomeRate }: ResourceHudProps) {
  const cash = useMemo(() => runeTween(money, 600), [money]);
  const tokens = useMemo(() => runeTween(dataTokens, 600), [dataTokens]);
  return <Panel shell="toast" layout="row" gap={20} padding={[10, 16, 10, 16]} label="Resources">
    <RuneView gap={2}>
      <Label size={10}>CASH</Label>
      <Text family={DISPLAY} size={22} weight={800} color={C.amber} text={bind(() => `$${formatMoney(cash.get())}`)} />
      <Text size={11} weight={700} color={C.teal} text={bind(() => { const hourly = servingIncomePerHour(servingIncomeRate()); return hourly > 0 ? `▲ +$${formatMoney(hourly)} / hr` : ""; })} />
    </RuneView>
    <Row gap={0}><RuneView gap={2}>
      <Label size={10}>TOKENS</Label>
      <Text family={DISPLAY} size={22} weight={800} color={C.teal} text={bind(() => formatCompactNumber(tokens.get()))} />
    </RuneView></Row>
  </Panel>;
}
