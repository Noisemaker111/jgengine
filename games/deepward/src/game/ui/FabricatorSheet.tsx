/** @jsxImportSource @jgengine/core/ui/jsx */
import type { WorldModel } from "@jgengine/core/worldModel/worldModel";
import { BAYS } from "../../world";
import { ITEMS, type ItemKind, type Home } from "../state";
import { kindOf } from "../items";
import { CODEX_ENTRIES, createDeepCodex, GEAR, GEAR_ORDER, gearMissing } from "../fabricator";
import { MODULE_ORDER, MODULES } from "../marrow";
import { goals, type Deep } from "../deep";
import { STRATA, STRATUM_ORDER } from "../strata";
import { Button, Heading, RED, Section, Sheet, Tag, Text } from "./dock";

const name = (id: string) => ITEMS[id as ItemKind]?.name ?? id;
const cost = (inputs: readonly { itemId: string; count: number }[]) => inputs.map(input => `${input.count} ${name(input.itemId)}`).join(" + ");

export function FabricatorSheet({ home, deep, world, departTo, hint, error, command, close }: {
  home: Home; deep: Deep; world: WorldModel; departTo: string; hint: string; error: string;
  command: (name: string, input?: unknown) => void; close: () => void;
}) {
  const codex = createDeepCodex(deep.codex);
  const instances = world.instances(), orders = world.orders();
  const power = world.num("marrow.power");
  const plan = goals(deep, world);
  const entries = CODEX_ENTRIES.filter(entry => (entry.meta?.kind === "log" || entry.meta?.kind === "fauna") && codex.isDiscovered(entry.id));
  const said = world.says("halloway");
  return <Sheet title="Marrow's fabricator" close={close}>
    <Tag>Fabricator / blueprints from scans, paid from the stash</Tag>
    {said.length > 0 && <Text>Halloway: {said[said.length - 1]}</Text>}
    <Heading>The job</Heading>
    {plan.map(goal => <Text key={goal.id}>{goal.text}{goal.done ? " / done" : goal === plan.find(g => !g.done) ? " / next" : ""}</Text>)}
    <Heading>Gear / {deep.gear.length} printed, {deep.lures} {deep.lures === 1 ? "lure" : "lures"} waiting</Heading>
    {GEAR_ORDER.map(id => {
      const gear = GEAR[id], view = codex.get(id), known = view?.discovered === true;
      const owned = gear.permanent && deep.gear.includes(id), missing = gearMissing(home.stash, id);
      return <Section key={id}>
        <Text size={17}>{gear.name}{owned ? " / printed" : known ? "" : ` / blueprint ${view?.scanned ?? 0} of ${view?.fragments ?? 1} scanned`}</Text>
        <Text>{gear.effect}. Cost: {cost(gear.recipe.inputs)}.</Text>
        <Button disabled={!known || owned || missing.length > 0} onPress={() => command("print", { gear: id })}>{owned ? `${gear.name} printed` : !known ? "Scan its fragments in Bellwether" : missing.length > 0 ? `Need ${cost(missing)}` : `Print ${gear.name}`}</Button>
      </Section>;
    })}
    <Heading>Bays / power {power >= 0 ? `+${power}` : power}{power < 0 ? " / nothing runs" : ""}</Heading>
    <Text>Galley {Math.floor(world.num("marrow.food"))} rations, {Math.floor(world.num("marrow.water"))} water. Modules build over time while Marrow runs.</Text>
    {BAYS.map((bay,index) => {
      const built = instances.find(instance => instance.slot === bay.id);
      const order = built === undefined ? undefined : orders.find(order => order.target === built.id);
      return <Text key={bay.id}>Bay {index + 1} · {built === undefined ? "Empty" : `${built.label}${built.ready ? power >= 0 ? " / running" : " / no power" : ` / building ${Math.round((order?.progress ?? 0) * 100)}%`}`}</Text>;
    })}
    {MODULE_ORDER.map(id => {
      const module = MODULES[id], missing = missingFor(home, module.recipe.inputs);
      const bay = BAYS.find(bay => world.occupant(bay.id) === null) ?? BAYS[0];
      const refusal = bay === undefined ? { message: "No bay available" } : world.canPlace(id, { slot: bay.id }, { free: true });
      return <Section key={id}><Text size={17}>{module.name} / {module.power > 0 ? `+${module.power}` : module.power} power</Text><Text>{module.effect}. Cost: {cost(module.recipe.inputs)}.</Text>
        <Button disabled={refusal !== null || missing.length > 0} onPress={() => command("build", { module: id })}>{refusal !== null ? refusal.message : missing.length > 0 ? `Need ${cost(missing)}` : `Build ${module.name}`}</Button>
      </Section>;
    })}
    {deep.gear.includes("crawler") && <Section><Heading>Crawler landing / {STRATA[departTo as keyof typeof STRATA]?.name ?? departTo}</Heading>{STRATUM_ORDER.filter(stratum => deep.charted.includes(stratum)).map(stratum => <Button key={stratum} onPress={() => command("departTo", { stratum })}>{`${STRATA[stratum].numeral} · ${STRATA[stratum].name}`}</Button>)}</Section>}
    {entries.length > 0 && <Heading>Codex / {codex.discoveredCount()} of {codex.total()}</Heading>}
    {entries.map(entry => <Section key={entry.id}><Text size={17}>{entry.name}</Text><Text>{entry.meta?.text}</Text></Section>)}
    <Text role="status">{hint}</Text>{error && <Text color={RED} role="alert">{error}</Text>}
    <Button onPress={close}>Back to Marrow</Button>
  </Sheet>;
}
function missingFor(home: Home, inputs: readonly { itemId: string; count: number }[]) {
  const have = new Map<string, number>();
  for (const item of home.stash) { const kind = kindOf(item); have.set(kind, (have.get(kind) ?? 0) + 1); }
  return inputs.filter(input => (have.get(input.itemId) ?? 0) < input.count).map(input => ({ itemId: input.itemId, count: input.count - (have.get(input.itemId) ?? 0) }));
}
