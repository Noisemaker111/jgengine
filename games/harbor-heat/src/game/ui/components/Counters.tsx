import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { runDialogueChoice, useOpenDialogueId, type DialogueDef } from "@jgengine/react/components";
import { useCurrency, useEntityStat, useGame, useGameStore, useInventory, usePlayer } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { cityOf } from "../../cityRuntime";
import { bestRaceStore, garageStore, houseStore, shopStore } from "../../commands";
import { UPGRADES, upgradesStore, type UpgradeShop } from "../../progression/upgrades";
import type { BoardRow } from "../fiction/PriceBoard";
import { ITEM_LABELS } from "../../content";
import { VEHICLES, type VehicleDef } from "../../entities/vehicles/catalog";
import { wantedStore } from "../../handroll";
import { marketStore } from "../../items/nightMarket";
import { GEAR, WEAPONS, type GearDef, type WeaponDef } from "../../items/weapons/catalog";
import { CRED_GATES } from "../../progression/cred";
import { FaceToFace, type Reply, type Speaker } from "../fiction/FaceToFace";
import { PriceBoard, type BoardSection } from "../fiction/PriceBoard";

const GUNS = WEAPONS.filter((item) => item.trade?.buy !== undefined && item.trade.shops?.includes("shop_ammunation"));
const KIT = GEAR.filter((item) => item.trade?.buy !== undefined && item.trade.shops?.includes("shop_ammunation"));
const CARS = VEHICLES.filter((car) => car.price > 0);

/**
 * A conversation is the city talking: the person's current line, then each job they can offer right
 * now. A new person or job in `city.ts` shows up here with no dialogue file.
 */
export function conversation(ctx: GameContext, dialogueId: string): DialogueDef | null {
  if (!dialogueId.startsWith("person:")) return null;
  const id = dialogueId.slice("person:".length);
  const world = cityOf(ctx);
  const person = world.def.people?.[id];
  if (person === undefined) return null;
  const line = world.says(id)[0] ?? "...";
  const offers = world.missionView() !== null ? [] : world.jobs().filter((job) => job.giver === id && (job.status === "available" || job.status === "failed"));
  return {
    id: `${dialogueId}:${offers.map((job) => job.id).join(",")}:${line}`,
    lines: [
      { speaker: person.name, text: line },
      ...offers.flatMap((job) => (job.pitch === null ? [] : [{ speaker: person.name, text: job.pitch }])),
      { choices: [...offers.map((job) => ({ label: `${job.status === "failed" ? "Try again" : "Take"}: ${job.title}`, invoke: { command: "city.job.start", args: { id: job.id } } })), { label: offers.length > 0 ? "Not now." : "Later.", invoke: { command: "dialogue.close", args: {} } }] },
    ],
  };
}

/** Whose face a contact's portrait is shot from: their own cast body, else their crew's. */
const PORTRAITS: Record<string, string> = { marco: "contact_marco", sal: "kingpin_sal", rita: "ped_city", dee: "cop_patrol", inez: "contact_inez" };
const CREW_PORTRAITS: Record<string, string> = { carmine: "ganger_dock", riptide: "riptide_soldier", hhpd: "cop_patrol", locals: "ped_city" };

const NO_RANKS: Readonly<Record<string, number>> = {};
const ROMAN = ["", "I", "II", "III", "IV"];

/** One shop's upgrades as board rows: the next rank's price and what it does, stamped owned once maxed. */
function useUpgradeRows(shop: UpgradeShop): BoardRow[] {
  const { commands } = useGame();
  const ranks = useStore(upgradesStore, (state) => state?.ranks ?? NO_RANKS);
  return UPGRADES.filter((node) => node.shop === shop).map((node) => {
    const rank = ranks[node.id] ?? 0;
    const max = node.maxRank ?? 1;
    const maxed = rank >= max;
    const cost = node.cost.kind === "steps" ? (node.cost.values[Math.min(rank + 1, max)] ?? 0) : 0;
    return {
      id: `upgrade:${node.id}`,
      name: node.label,
      tag: max > 1 ? `${ROMAN[Math.min(rank + (maxed ? 0 : 1), max)]}/${ROMAN[max]}` : undefined,
      line: maxed ? node.lines[max - 1] : node.lines[rank],
      price: cost,
      owned: maxed,
      pick: () => commands.run("upgrade.buy", { id: node.id }),
    };
  });
}

function speakerOf(ctx: GameContext, dialogueId: string): Speaker | null {
  const id = dialogueId.slice("person:".length);
  const world = cityOf(ctx);
  const person = world.def.people?.[id];
  if (person === undefined) return null;
  const faction = person.faction;
  return {
    name: person.name,
    faction,
    crew: faction === undefined ? undefined : world.def.factions?.[faction]?.label,
    portrait: PORTRAITS[id] ?? (faction === undefined ? undefined : CREW_PORTRAITS[faction]),
  };
}

/** What a gun or a box does, in a line short enough for the board. */
function weaponLine(item: WeaponDef): string {
  if (item.weapon.explosion !== undefined) return `Thrown · ${item.weapon.damage} blast · ${item.weapon.explosion.radius} m`;
  const perSecond = Math.round((item.weapon.damage * 1000) / item.fireIntervalMs);
  return `${item.weapon.damage} a shot · ${perSecond} a second · ${item.ammo === "shell" ? "12-gauge" : "9 mm"}`;
}
function gearLine(item: GearDef): string {
  if (item.heal !== undefined) return `Patches ${item.heal} health · Q to use`;
  if (item.armor !== undefined) return `${item.armor} armor over your health`;
  if (item.ammoGrant !== undefined) return `${item.ammoGrant.amount} rounds into your pocket`;
  return "";
}
function carLine(car: VehicleDef): string {
  if (car.dynamics.type !== "ground") {
    const tuning = car.dynamics.tuning;
    const what = tuning.kind === "rotorcraft" ? "Helicopter" : tuning.kind === "fixedWing" ? "Plane, needs a runway" : "Jump jet, lifts off straight up";
    return `${what} · tops out near ${Math.round(tuning.maxSpeed * 3.6)} km/h`;
  }
  const top = Math.round(car.dynamics.tuning.topSpeed * 3.6);
  return `Tops out near ${top} km/h · ${car.collisionRadius >= 2 ? "heavy" : car.collisionRadius >= 1.5 ? "sturdy" : "light"} build`;
}

function countIn(slots: readonly ({ itemId: string; count?: number } | null | undefined)[], itemId: string): number {
  let total = 0;
  for (const slot of slots) if (slot?.itemId === itemId) total += slot.count ?? 1;
  return total;
}

/** The Ammu-Isle gun counter: tonight's night-market pieces, the rack, the shelf, and the bribe. */
function GunCounter() {
  const { commands } = useGame();
  const cash = useCurrency("cash");
  const cred = useEntityStat(usePlayer().userId, "level")?.current ?? 1;
  const market = useStore(marketStore);
  const stars = useStore(wantedStore, (wanted) => wanted?.stars ?? 0);
  const hotbar = useInventory("hotbar");
  const backpack = useInventory("backpack");
  const workRows = useUpgradeRows("guns");
  const sections: BoardSection[] = [
    {
      id: "market",
      title: "Night market",
      note: "one of each · tonight only",
      rows: (market?.items ?? []).map((item) => ({ id: item.id, name: item.name, tag: item.rarity, line: `Level ${item.level} · ${item.damage} a shot`, price: item.price, pick: () => commands.run("market.buy", { itemId: item.id }) })),
    },
    {
      id: "rack",
      title: "The rack",
      rows: GUNS.map((item) => ({ id: item.id, name: ITEM_LABELS[item.id] ?? item.label, line: weaponLine(item), price: item.trade?.buy?.cash ?? 0, gate: CRED_GATES[item.id], owned: item.id.startsWith("grenade") ? undefined : countIn(hotbar, item.id) > 0, count: item.id.startsWith("grenade") ? countIn(hotbar, item.id) : undefined, pick: () => commands.run("shop.buy", { item: item.id }) })),
    },
    {
      id: "shelf",
      title: "The shelf",
      rows: KIT.map((item) => ({ id: item.id, name: ITEM_LABELS[item.id] ?? item.label, line: gearLine(item), price: item.trade?.buy?.cash ?? 0, gate: CRED_GATES[item.id], count: countIn(backpack, item.id), pick: () => commands.run("shop.buy", { item: item.id }) })),
    },
    {
      id: "work",
      title: "Gunsmith's bench",
      note: "every gun you carry",
      rows: workRows,
    },
    {
      id: "under",
      title: "Under the counter",
      note: "HHPD takes cash",
      rows: stars === 0 ? [] : [{ id: "bribe", name: "Make HHPD forget you", line: `Clears all ${stars} star${stars === 1 ? "" : "s"} of heat`, price: stars * 250, pick: () => commands.run("shop.bribe", {}) }],
    },
  ];
  return <PriceBoard look="pawn" kicker="Mainsail · guns · ammo · armor" title="Ammu-Isle" sub="Cash only. No names, no questions." sections={sections} cash={cash} cred={cred} onLeave={() => commands.run("shop.close", {})} />;
}

/** Sunset Motors: Rita's lot, each car with its price on the windscreen. */
function CarLot() {
  const { commands } = useGame();
  const cash = useCurrency("cash");
  const cred = useEntityStat(usePlayer().userId, "level")?.current ?? 1;
  const bestLap = useStore(bestRaceStore, (v) => v);
  const modRows = useUpgradeRows("garage");
  const sections: BoardSection[] = [{
    id: "lot",
    title: "On the lot",
    note: "delivered to the bay out front",
    rows: CARS.map((car) => ({ id: car.id, name: car.label, line: carLine(car), price: car.price, gate: CRED_GATES[car.id], pick: () => commands.run("garage.buy", { vehicle: car.id }) })),
  }, {
    id: "mods",
    title: "Rita's bay",
    note: "fitted to every car you own",
    rows: modRows,
  }];
  return <PriceBoard look="lot" kicker="Rita Salgado · used & fast" title="Sunset Motors" sub="Every car runs. Most of them are clean." sections={sections} cash={cash} cred={cred} onLeave={() => commands.run("garage.close", {})} aside={bestLap === undefined ? null : `Ocean Loop record on the wall: ${bestLap.toFixed(1)} s`} />;
}

/** Palmview Bungalow: the bed, the rooms you have fitted, and the wire room's line to the safe. */
function House() {
  const { commands } = useGame();
  const cash = useCurrency("cash");
  const cred = useEntityStat(usePlayer().userId, "level")?.current ?? 1;
  const roomRows = useUpgradeRows("house");
  const wired = useStore(upgradesStore, (state) => (state?.ranks.house_wire ?? 0) > 0);
  const takings = useGameStore((ctx) => Math.floor(cityOf(ctx).num("fronts.takings")));
  const sections: BoardSection[] = [
    {
      id: "rest",
      title: "Home",
      rows: [
        { id: "sleep", name: "Sleep till morning", line: "The city keeps moving while you sleep", price: 0, pick: () => commands.run("safehouse.sleep", {}) },
        { id: "patch", name: "Patch up and save", line: "Back to full health", price: 0, pick: () => commands.run("safehouse.patch", {}) },
        ...(wired && takings > 0 ? [{ id: "wire", name: "Call in the takings", line: `${takings.toLocaleString("en-US")} waiting in the fronts' safe`, price: 0, pick: () => commands.run("front.collect", {}) }] : []),
      ],
    },
    { id: "rooms", title: "Fit out the place", note: "one of each", rows: roomRows },
  ];
  return <PriceBoard look="house" kicker="Palmview · your place" title="The Bungalow" sub="Yours. Locks on the inside." sections={sections} cash={cash} cred={cred} onLeave={() => commands.run("house.close", {})} />;
}

function Talk({ dialogue, dialogueId }: { dialogue: DialogueDef; dialogueId: string }) {
  const { commands } = useGame();
  const speaker = useGameStore((ctx) => speakerOf(ctx, dialogueId), (a, b) => a?.name === b?.name && a?.portrait === b?.portrait);
  if (speaker === null) return null;
  const lines = dialogue.lines.flatMap((line) => ("text" in line ? [line.text] : []));
  const choices = dialogue.lines.flatMap((line) => ("choices" in line ? line.choices : []));
  const replies: Reply[] = choices.map((choice) => ({ label: choice.label, job: choice.invoke?.command === "city.job.start", run: () => runDialogueChoice(commands, choice, null) }));
  return <FaceToFace key={dialogue.id} speaker={speaker} lines={lines} replies={replies} onLeave={() => commands.run("dialogue.close", {})} />;
}

export function Counters() {
  const dialogueId = useOpenDialogueId();
  const shop = useStore(shopStore, (v) => v ?? null);
  const garage = useStore(garageStore, (v) => v === true);
  const house = useStore(houseStore, (v) => v === true);
  const dialogue = useGameStore((ctx) => (dialogueId === null ? null : conversation(ctx, dialogueId)), (a, b) => a?.id === b?.id);
  if (dialogue !== null && dialogueId !== null) return <Talk dialogue={dialogue} dialogueId={dialogueId} />;
  if (shop !== null) return <GunCounter />;
  if (garage) return <CarLot />;
  if (house) return <House />;
  return null;
}
