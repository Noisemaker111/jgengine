/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useCurrency, useEntityStat, useGame, useGameStore, usePlayer } from "@jgengine/ui/hooks";
import { useStore } from "@jgengine/ui/store";
import { customerById, pizzaById } from "../pizza/menu";
import { nightlyQuota, nextTier, ovenCapacity, UPGRADES, type UpgradeKind } from "../pizza/pizzeria";
import { pizzeriaBoardStore, pizzeriaStore, shiftStore, shopRep } from "../pizza/shift";
import { repStars, REP_THRESHOLDS } from "../pizza/orders";
import { shiftOpen, TIDE_STAGES } from "../tide/tide";
import { tideStore } from "../tide/tideRuntime";
import { streetPlayOf } from "../streetPlay";
import { Button, clockText, Heading, Label, money, Row, Scrim, Text, useRoom } from "./kit";
import { PriceBoard, type BoardSection } from "./PriceBoard";
import { DISPLAY, HH } from "./theme";

/** Heat from oven-red through amber to cold blue. */
function heatColor(heat: number): string {
  if (heat >= 70) return "#ff5a3a";
  if (heat >= 45) return HH.amber;
  if (heat >= 25) return "#e8d27a";
  return "#7fb6d9";
}

interface ShiftView {
  clock: string;
  stage: string;
  stageIndex: number;
  level: number;
  open: boolean;
  board: number;
  capacity: number;
  takings: number;
  quota: number;
  water: string;
  bag: { id: string; who: string; pizza: string; heat: number; soak: number; cold: number }[];
}

function shiftView(ctx: GameContext): ShiftView | null {
  const tide = tideStore.read(ctx);
  if (tide === null) return null;
  const shift = shiftStore.read(ctx);
  const shop = pizzeriaStore.read(ctx);
  return {
    clock: clockText(tide.hour, tide.minute),
    stage: tide.stageLabel,
    stageIndex: tide.stageIndex,
    level: Math.round(tide.level * 10) / 10,
    open: tide.open,
    board: shift.board.length,
    capacity: ovenCapacity(shop),
    takings: shift.takings,
    quota: nightlyQuota(shop),
    water: streetPlayOf(ctx).telemetry().water,
    bag: shift.bag.map((order) => ({
      id: order.id,
      who: customerById(order.customerId)?.name ?? order.customerId,
      pizza: pizzaById(order.pizzaId)?.label ?? order.pizzaId,
      heat: Math.round(order.heat),
      soak: Math.round(order.soak / 5) * 5,
      cold: customerById(order.customerId)?.coldLimit ?? 25,
    })),
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A thin meter: `value` of 100 filled in `color`; the cold limit shows as the fill turning blue. */
function Meter({ value, color, width }: { value: number; color: string; width: number }) {
  const fill = Math.max(2, Math.max(0, Math.min(1, value / 100)) * width);
  return (
    <RuneView layout="row" width={width} height={6} fill="#0b1416" radius={3}>
      <RuneView width={fill} height={6} fill={color} radius={3} />
    </RuneView>
  );
}

/**
 * The night's card under the pager: the tide gauge (clock, stage, five pips), what is on the board,
 * the night's takings against MegaSlice's quota, and every box in the bag with its heat and soak.
 */
export function ShiftPanel() {
  const view = useGameStore(shiftView, sameJson);
  const room = useRoom();
  if (view === null) return null;
  const width = room === "stacked" ? 214 : room === "wide" ? 330 : 236;
  const meter = width - 24;
  return (
    <RuneView width={width} gap={6} padding={[8, 10, 8, 10]} fill="#0c2630ee" radius={10} border={{ width: 2, color: "#06141a" }} shadow={{ x: 4, y: 5, blur: 0, color: "#00000066" }}>
      <Row justify="between">
        <Text family={DISPLAY} size={13} tracking={2} color={HH.mint} text="TIDE CLOCK" />
        <Text mono size={13} weight={700} color={HH.cream} text={view.clock} />
      </Row>
      <Row gap={4}>
        {TIDE_STAGES.map((stage) => (
          <RuneView key={stage.id} grow={1} height={8} radius={2} fill={stage.index <= view.stageIndex ? (stage.index >= 3 ? "#2fb3d9" : HH.mint) : "#173843"} />
        ))}
      </Row>
      <Row justify="between">
        <Text family={DISPLAY} size={18} tracking={0.5} color={view.stageIndex >= 3 ? "#6fd8ff" : HH.cream} text={view.stage.toUpperCase()} />
        <Text size={12} color={HH.dim} text={`water +${view.level.toFixed(1)} m`} />
      </Row>
      {view.water === "" ? null : (
        <RuneView padding={[2, 6, 2, 6]} radius={3} fill={HH.siren}><Text mono size={12} weight={700} color={HH.cream} text={view.water} /></RuneView>
      )}
      <Row justify="between">
        <Label color={HH.dim} text={view.open ? `Board ${view.board} · bag ${view.bag.length}/${view.capacity}` : "Vell's is closed"} />
        <Text size={12} weight={700} color={view.takings >= view.quota ? HH.cash : HH.amber} text={`${money(view.takings)} / ${money(view.quota)}`} />
      </Row>
      {view.bag.map((box) => (
        <RuneView key={box.id} gap={2} padding={[4, 6, 4, 6]} radius={4} fill="#123742">
          <Row justify="between" gap={6}>
            <Text size={12} weight={700} shrink color={HH.cream} text={box.who} />
            <Text size={12} weight={700} color={heatColor(box.heat)} text={`${box.heat}°`} />
          </Row>
          <Text size={11} color={HH.dim} text={box.soak > 0 ? `${box.pizza} · ${box.soak}% soggy` : box.pizza} />
          <Meter value={box.heat} color={box.heat < box.cold ? "#7fb6d9" : heatColor(box.heat)} width={meter - 12} />
        </RuneView>
      ))}
    </RuneView>
  );
}

/** Midnight's card: the night's numbers, MegaSlice's verdict, and sleep or ride on. */
export function ShiftSummaryCard() {
  const { commands } = useGame();
  const summary = useStore(shiftStore, (state) => state.summary);
  const shop = useStore(pizzeriaStore, (state) => state);
  if (summary === null) return null;
  const rows: [string, string][] = [
    ["Boxes delivered", `${summary.delivered}`],
    ["Takings", money(summary.takings)],
    ["Best drop", money(summary.best)],
    ["Lost to the tide or the Crust", `${summary.lost}`],
    ["MegaSlice's quota", `${money(summary.quota)} · ${summary.metQuota ? "made" : "missed"}`],
    ["Still owed on the note", money(shop.debt)],
  ];
  return (
    <Scrim back={() => commands.run("shift.dismiss", {})} label="Shift over" role="dialog">
      <RuneView width={420} padding={18} gap={10} fill="#5b1e18" border={{ width: 3, color: HH.cream }} radius={6} shadow={{ x: 8, y: 10, blur: 0, color: "#00000088" }}>
        <Label color={HH.amber} text={`NIGHT ${summary.day + 1} · LAST ORDERS`} />
        <Text family={DISPLAY} size={40} color={HH.cream} text="Shift over" />
        <Text size={15} color={summary.foreclosed ? "#ffb4a0" : HH.cream} text={summary.headline} />
        <RuneView gap={4} padding={10} fill="#2a0e0b" radius={4}>
          {rows.map(([label, value]) => (
            <Row key={label} justify="between"><Text size={14} color="#e9dcc0" text={label} /><Text family={DISPLAY} size={18} color={HH.amber} text={value} /></Row>
          ))}
          <Row justify="between"><Text size={14} color="#e9dcc0" text="MegaSlice pressure" /><Text family={DISPLAY} size={18} color={shop.pressure >= 70 ? HH.coral : HH.mint} text={`${shop.pressure}%`} /></Row>
        </RuneView>
        <Row gap={10}>
          <Button onPress={() => commands.run("shift.sleep", {})}>Sleep till dusk</Button>
          <Button tone="ink" onPress={() => commands.run("shift.dismiss", {})}>Ride on</Button>
        </Row>
      </RuneView>
    </Scrim>
  );
}

const UPGRADE_KINDS: readonly UpgradeKind[] = ["oven", "toppings", "bag"];

/** The shop's books at the oven window: what the tips buy, and the note MegaSlice holds. */
export function PizzeriaBooks() {
  const { commands } = useGame();
  const cash = useCurrency("cash");
  const cred = useEntityStat(usePlayer().userId, "level")?.current ?? 1;
  const shop = useStore(pizzeriaStore, (state) => state);
  const rep = useGameStore(shopRep);
  const open = useGameStore((ctx) => shiftOpen(ctx.time.calendar().hour + ctx.time.calendar().minute / 60));
  const nextRep = REP_THRESHOLDS[Math.min(REP_THRESHOLDS.length - 1, repStars(shop.goodDeliveries) + 1)] ?? 0;
  const sections: BoardSection[] = [
    {
      id: "kitchen",
      title: "The kitchen",
      note: "tips pay for it",
      rows: UPGRADE_KINDS.map((kind) => {
        const track = UPGRADES[kind];
        const next = nextTier(shop, kind);
        const current = track.tiers[shop[kind] - 1]?.label ?? "";
        return {
          id: `up:${kind}`,
          name: next === null ? `${track.label}: ${current}` : `${track.label}: ${next.label}`,
          tag: `${shop[kind]}/${track.tiers.length}`,
          line: next === null ? "The best in Mainsail." : `${track.blurb} Now: ${current}.`,
          price: next?.cost ?? 0,
          owned: next === null,
          pick: () => commands.run("pizzeria.upgrade", { kind }),
        };
      }),
    },
    {
      id: "note",
      title: "MegaSlice's note",
      note: shop.saved ? "paid in full" : `${money(shop.debt)} owed · pressure ${shop.pressure}%`,
      rows: shop.saved ? [] : [500, 2000, shop.debt].filter((amount, index, all) => amount > 0 && all.indexOf(amount) === index && amount <= shop.debt).map((amount) => ({
        id: `pay:${amount}`,
        name: amount === shop.debt ? "Pay it all off" : `Pay ${money(amount)} off the note`,
        line: amount === shop.debt ? "Save the shop. MegaSlice walks away for good." : "Every payment eases MegaSlice off.",
        price: amount,
        pick: () => commands.run("pizzeria.pay", { amount }),
      })),
    },
    {
      id: "rest",
      title: "Upstairs",
      rows: open ? [] : [{ id: "sleep", name: "Sleep till dusk", line: "Wake at 17:30 with the dough risen and the tide out.", price: 0, pick: () => commands.run("shift.sleep", {}) }],
    },
  ];
  return (
    <PriceBoard look="pizzeria" kicker={`Vell's · since 1961 · ${"★".repeat(rep)}${"☆".repeat(5 - rep)}`} title="The Books" sub={`Rep ${rep}/5 · ${shop.goodDeliveries} happy deliveries · next star at ${nextRep}`}
      sections={sections} cash={cash} cred={cred} onLeave={() => commands.run("pizzeria.close", {})} aside={`Nightly quota ${money(nightlyQuota(shop))} · ${shop.shifts} shifts worked`} />
  );
}

/** Whether the books are open, for the counters switch. */
export function usePizzeriaBooksOpen(): boolean {
  return useStore(pizzeriaBoardStore, (open) => open === true);
}

export { Heading };
