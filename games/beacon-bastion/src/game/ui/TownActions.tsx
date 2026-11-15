/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useGameContext } from "@jgengine/ui/provider";

import { keep } from "../keep";
import { gameClockMs, session } from "../session";
import { actionCost, lotCost, nextLot, outageOn, TOWN_ACTIONS, wifiOff } from "../sinks";
import { FLANK_POINT_KEY, HAS_FLANK, SPAWN_POINT_KEY } from "../world/path";
import { GOLD, Glyph, Plank, Tag, Text, usePhone } from "./look";

/**
 * The town hall's buttons for a street with cash to burn: a Power Outage on either road, Free Wi-Fi
 * Off against the routers, and a spare lot bought open. Prices climb with the wave; a button that is
 * running shows the seconds it has left.
 */
export function TownActions() {
  const ctx = useGameContext(), phone = usePhone();
  const gold = () => keep.of(ctx).num("keep.gold");
  const now = () => gameClockMs(ctx);
  const left = (untilMs: number) => Math.max(0, Math.ceil((untilMs - now()) / 1000));
  const outage = (route: string, name: string) => {
    const text = () => (outageOn(route, now()) ? `${name} dark · ${left(session.sinks.outage.get(route) ?? 0)}s` : `Outage: ${name} · $${actionCost("outage")}`);
    return <Plank key={route} minHeight={30} padding={[3, 8, 3, 8]} label={`Power Outage on the ${name}`} tooltip={TOWN_ACTIONS.outage.detail}
      opacity={bind(() => (gold() >= actionCost("outage") || outageOn(route, now()) ? 1 : 0.55))} command={{ name: "town.buy", input: { action: "outage", route } }}>
      <Glyph name="plug" size={13} /><Text size={12} text={bind(text)} />
    </Plank>;
  };
  return <RuneView variant="sign" gap={4} padding={[6, 8, 8, 8]} width={phone ? 170 : 200} label="Town hall">
    <Tag size={10}>TOWN HALL</Tag>
    {outage(SPAWN_POINT_KEY, "main road")}
    {HAS_FLANK ? outage(FLANK_POINT_KEY, "side road") : null}
    <Plank minHeight={30} padding={[3, 8, 3, 8]} label="Free Wi-Fi Off" tooltip={TOWN_ACTIONS.wifi.detail}
      opacity={bind(() => (gold() >= actionCost("wifi") || wifiOff(now()) ? 1 : 0.55))} command={{ name: "town.buy", input: { action: "wifi" } }}>
      <Glyph name="lightning" size={13} /><Text size={12} text={bind(() => (wifiOff(now()) ? `Wi-Fi off · ${left(session.sinks.wifiOffUntilMs)}s` : `Wi-Fi Off · $${actionCost("wifi")}`))} />
    </Plank>
    <Plank minHeight={30} padding={[3, 8, 3, 8]} label="Open a new lot" tooltip="Buy a spare lot open: one more plot for a worker, for the rest of the day"
      opacity={bind(() => (nextLot() !== null && gold() >= lotCost() ? 1 : 0.55))} command={{ name: "town.buy", input: { lot: true } }}>
      <Glyph name="arrowUp" size={13} color={GOLD} /><Text size={12} text={bind(() => (nextLot() === null ? "Every lot open" : `New lot · $${lotCost()}`))} />
    </Plank>
  </RuneView>;
}
