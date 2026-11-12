/** @jsxImportSource @jgengine/core/ui/jsx */
import { useEffect, useMemo, useState, type ReactNode } from "@jgengine/core/ui/jsx";
import { allActionCodes } from "@jgengine/core/input/actionBindings";
import { useActionBindings } from "@jgengine/core/input/actionBindings.view";
import { onboardingLock } from "@jgengine/core/onboarding/onboardingSystem";
import { RuneAction, RuneFor, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind, type RuneSource } from "@jgengine/core/ui/rune/primitives";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { inventorySlotKey, parseInventorySlotKey, type InventorySlot } from "@jgengine/core/inventory/inventoryModel";
import { useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";

import { storeView } from "../base";
import { BAG, HOTBAR } from "../bags";
import { obeliskView } from "../broodmother";
import { BODIES, survivorLook } from "../character";
import { itemDef, itemLabel } from "../data/items";
import { dossierPages } from "../dossier";
import type { SurvivorScreen } from "../screens";
import { craftable } from "../survivor";
import { CreaturePanel } from "./Creature";
import { ItemIcon } from "./ItemIcon";
import { BAD, Button, FULL, GOLD, GOOD, GREEN, HEAD, INK, Panel, Row, Small, Tag, Text } from "./kit";
import { liveSurvivor, same } from "./live";

type Give = "giveCreature" | "storePut" | null;

/** A bounded slice of the game's state as a keyed source: recomputed when the game notifies, kept while equal. */
export function storeSource<T>(ctx: GameContext, select: (ctx: GameContext) => readonly T[]): RuneSource<T> {
  let version = -1;
  let list: readonly T[] = [];
  return {
    read: () => {
      const now = ctx.version();
      if (now !== version) {
        version = now;
        const next = select(ctx);
        if (!same(next, list)) list = next;
      }
      return list;
    },
    subscribe: (change) => ctx.subscribe(change),
  };
}

interface Cell { index: number; slot: InventorySlot | null }

/** One inventory as a grid of slots: click sends an item across (`give` names where), drag reorders it or drops onto the other grid. */
function SlotGrid({ inventoryId, columns, size, give }: { inventoryId: string; columns: number; size: number; give: Give }): ReactNode {
  const ctx = useGameContext();
  const source = useMemo(() => storeSource<Cell>(ctx, (c) => c.player.inventory.state(inventoryId).slots.map((slot, index) => ({ index, slot }))), [ctx, inventoryId]);
  const run = (name: string, input: unknown) => void ctx.game.commands.run(name, input);
  return (
    <RuneView layout="grid" columns={columns} gap={4} width={columns * (size + 4)}>
      <RuneFor source={source} keyBy={(cell) => cell.index}>
        {(cell) => (
          <RuneAction variant="cell" width={size} height={size}
            label={cell.slot === null ? `Empty slot ${cell.index + 1}` : `${itemLabel(cell.slot.itemId)}${cell.slot.count > 1 ? ` ×${cell.slot.count}` : ""}`}
            {...(cell.slot === null ? {} : { tooltip: itemLabel(cell.slot.itemId), dragValue: inventorySlotKey({ inventoryId, slot: cell.index }) })}
            run={() => { if (cell.slot !== null) run(give ?? "shuttle", { inventoryId, slot: cell.index }); }}
            acceptDrop={(value) => {
              // A drop from the other grid moves across: bag to hotbar and back, swapping or merging stacks.
              const from = parseInventorySlotKey(value);
              if (from === null || (from.inventoryId === inventoryId && from.slot === cell.index)) return;
              run("inventory.move", from.inventoryId === inventoryId
                ? { inventoryId, from: from.slot, to: cell.index }
                : { inventoryId: from.inventoryId, from: from.slot, to: cell.index, toInventoryId: inventoryId });
            }}>
            {cell.slot === null ? null : <ItemIcon itemId={cell.slot.itemId} size={size - 8} />}
            {cell.slot === null || cell.slot.count <= 1 ? null : <RuneView pin={[null, null, 3, 1]}><Small size={10} weight={700} color={INK} text={String(cell.slot.count)} /></RuneView>}
          </RuneAction>
        )}
      </RuneFor>
    </RuneView>
  );
}

/** Left: what you carry, ARK's grid with the hotbar row under it. Beside a creature or a container, a click puts the item in it. */
function Carried({ give = null }: { give?: Give }): ReactNode {
  const ctx = useGameContext();
  const { width } = useRuneViewport();
  const phone = width < 600;
  const worn = useGameStore((c) => liveSurvivor(c).worn, same);
  const hint = give === "giveCreature" ? "Click an item to give it to the creature." : give === "storePut" ? "Click an item to put it in the box." : "Click moves an item between inventory and hotbar; drag to rearrange or drop onto either grid. Number keys use or equip hotbar items.";
  return (
    <Panel width={phone ? 370 : 400}>
      <Row justify="between">
        <Tag text="Your inventory" />
        <Small text={bind(() => { const v = liveSurvivor(ctx); return `Weight ${v.weight.value} / ${v.weight.max}`; })} color={bind(() => (liveSurvivor(ctx).encumbered ? BAD : "#ccffee"))} />
      </Row>
      <RuneView maxHeight={phone ? 260 : 330} scroll>
        <SlotGrid inventoryId={BAG} columns={6} size={phone ? 52 : 58} give={give} />
      </RuneView>
      <Tag text="Hotbar" />
      <SlotGrid inventoryId={HOTBAR} columns={10} size={phone ? 31 : 34} give={give} />
      {worn.map((tool) => (
        <Row key={tool.itemId} gap={8}>
          <Small grow={1} shrink color={tool.left / tool.max < 0.25 ? BAD : "#ccffee"} text={`${tool.label} ${tool.left} / ${tool.max}`} />
          <Small text={tool.cost.map((entry) => `${entry.count} ${itemLabel(entry.item)}`).join(", ")} />
          <Button disabled={!tool.canRepair} label={`Repair ${tool.label}`} command={{ name: "repairTool", input: { itemId: tool.itemId } }}>Repair</Button>
        </Row>
      ))}
      <Small size={11} text={hint} />
    </Panel>
  );
}

const STAT_NOW: Record<string, (v: ReturnType<typeof liveSurvivor>) => string> = {
  health: (v) => `${Math.floor(v.health.value)} / ${v.health.max}`,
  stamina: (v) => `${Math.floor(v.stamina.value)} / ${v.stamina.max}`,
  oxygen: (v) => `${Math.floor(v.oxygen.value)} / ${v.oxygen.max}`,
  food: (v) => `${Math.floor(v.food.value)} / ${v.food.max}`,
  water: (v) => `${Math.floor(v.water.value)} / ${v.water.max}`,
  weight: (v) => `${v.weight.value} / ${v.weight.max}`,
};

function GearSlot({ slot }: { slot: { id: string; label: string; item: string | null } }): ReactNode {
  return (
    <RuneAction variant="cell" width={50} height={50} label={slot.item === null ? `${slot.label} empty` : `Take off ${itemLabel(slot.item)}`} tooltip={slot.label} command={{ name: "takeOff", input: { slot: slot.id } }} disabled={slot.item === null}>
      {slot.item === null ? <Small size={10} text={slot.label} /> : <ItemIcon itemId={slot.item} size={42} />}
    </RuneAction>
  );
}

/** Centre: ARK's survivor pane — armour slots round the body, insulation, the XP bar and the stats with their level-up buttons. */
function Survivor(): ReactNode {
  const ctx = useGameContext();
  const { width } = useRuneViewport();
  const shape = useGameStore((c) => {
    const v = liveSurvivor(c);
    const look = survivorLook(c);
    return { name: look.name, body: BODIES.find((b) => b.id === look.body)?.label ?? look.body, height: look.height, level: v.level, points: v.statPoints, gear: v.gear, insulation: v.insulation, stats: v.stats.map((stat) => ({ id: stat.id, label: stat.label, unit: stat.unit })) };
  }, same);
  const v = () => liveSurvivor(ctx);
  const left = shape.gear.filter((slot) => slot.id === "head" || slot.id === "torso" || slot.id === "legs");
  const right = shape.gear.filter((slot) => !left.includes(slot));
  return (
    <Panel width={width < 600 ? 370 : 380}>
      <Tag size={14} align="center" text={`${shape.name} - Lvl ${shape.level}`} />
      <Row justify="center" items="start" gap={10}>
        <RuneView gap={6}>{left.map((slot) => <GearSlot key={slot.id} slot={slot} />)}</RuneView>
        <RuneView width={150} height={170} radius={4} border={{ width: 1, color: "#6fb7c933" }} fill="#14222a" justify="center" items="center" gap={4} label="Survivor">
          <Text size={30} color={HEAD} text="◯" />
          <Small color={INK} text={shape.body} />
          <Small text={`Height ${Math.round(shape.height * 100)}%`} />
        </RuneView>
        <RuneView gap={6}>{right.map((slot) => <GearSlot key={slot.id} slot={slot} />)}</RuneView>
      </Row>
      <Row justify="between">
        <Small text={`Hypothermal insulation +${shape.insulation.cold}°C`} />
        <Small text={`Hyperthermal +${shape.insulation.heat}°C`} />
      </Row>
      <RuneView height={14} width={FULL} fill="#00000099" border={{ width: 1, color: "#6fb7c955" }} radius={7} clip>
        <RuneView pin={[0, 0, null, 0]} fill="#2d8fa6" width={bind(() => ({ fraction: Math.max(0, Math.min(1, (v().xp - v().xpFrom) / Math.max(1, v().xpNext - v().xpFrom))) }))} />
        <RuneView pin={[0, 0, 0, 0]} justify="center" items="center"><Small size={10} color={INK} text={bind(() => `XP: ${v().xp} / ${v().xpNext}`)} /></RuneView>
      </RuneView>
      {shape.points > 0 ? <Text size={12} weight={700} color={GOOD} text={`${shape.points} point${shape.points === 1 ? "" : "s"} to spend`} /> : null}
      {shape.stats.map((stat) => (
        <Row key={stat.id} gap={8}>
          <Text size={13} grow={1} text={stat.label} />
          <Text size={13} text={bind(() => STAT_NOW[stat.id]?.(v()) ?? `${v().stats.find((entry) => entry.id === stat.id)?.value ?? 0}${stat.unit}`)} />
          <RuneAction variant={shape.points > 0 ? "picked" : "action"} width={26} height={24} minHeight={24} padding={0} label={`Level ${stat.label}`} disabled={shape.points <= 0} command={{ name: "levelStat", input: { stat: stat.id } }}>+</RuneAction>
        </Row>
      ))}
      <Small text={bind(() => `${v().temperature}°C · ${v().comfort} · Torpor ${Math.floor(v().torpor.value)} / ${v().torpor.max}`)} />
      <Small size={11} text="Click armour in your bag to wear it; click a worn piece to take it off." />
    </Panel>
  );
}

/** Right: ARK's crafting panel — learned recipes, what they cost, and the queue. */
function Crafting(): ReactNode {
  const ctx = useGameContext();
  const { width } = useRuneViewport();
  const recipes = useGameStore(craftable, same);
  const queue = useGameStore((c) => liveSurvivor(c).queue.map((job) => ({ id: job.id, output: job.output })), same);
  return (
    <Panel width={width < 600 ? 370 : 360}>
      <Tag text="Crafting" />
      <RuneView scroll maxHeight={width < 600 ? 300 : 360} gap={4}>
        {recipes.map((recipe) => (
          <Row key={recipe.id} gap={4} items="stretch">
            <RuneAction variant="action" grow={1} shrink justify="start" items="stretch" padding={6} label={`Craft ${itemLabel(recipe.output)}`} opacity={recipe.blocked === null ? 1 : 0.6} tooltip={recipe.blocked ?? `Craft ${itemLabel(recipe.output)}`}
              command={{ name: "craft", input: { recipeId: recipe.id, count: 1 } }}>
              <Row gap={8} width={FULL}>
                <ItemIcon itemId={recipe.output} size={36} />
                <RuneView gap={2} grow={1} shrink>
                  <Text size={13} weight={700} text={itemLabel(recipe.output)} />
                  <Small size={11} color={recipe.inputs.every((input) => input.have >= input.count) ? "#bfe6c3" : "#ff9a8a"} text={recipe.inputs.map((input) => `${input.have}/${input.count} ${itemLabel(input.itemId)}`).join("   ")} />
                </RuneView>
              </Row>
            </RuneAction>
            <RuneAction variant="action" width={40} padding={0} label={`Craft five ${itemLabel(recipe.output)}`} opacity={recipe.blocked === null ? 1 : 0.6} command={{ name: "craft", input: { recipeId: recipe.id, count: 5 } }}>×5</RuneAction>
          </Row>
        ))}
      </RuneView>
      {queue.length > 0 ? <Tag text="Queue" /> : null}
      {queue.map((job, index) => (
        <Row key={job.id} gap={8}>
          <Small color={INK} grow={1} text={itemLabel(job.output)} />
          <RuneView width={100} height={6} fill="#00000088" radius={3} clip>
            <RuneView height={6} fill={HEAD} width={bind(() => ({ fraction: liveSurvivor(ctx).queue[index]?.progress ?? 0 }))} />
          </RuneView>
          <RuneAction label={`Cancel ${itemLabel(job.output)}`} padding={[0, 6, 0, 6]} color="#ff9a8a" command={{ name: "cancelCraft", input: { jobId: job.id } }}>✕</RuneAction>
        </Row>
      ))}
      <Small size={11} text="Craft makes one; ×5 queues five." />
    </Panel>
  );
}

/** ARK's dossier and explorer notes: every species, met or still "???", which you have tamed, and the notes you have found. */
function Dossier(): ReactNode {
  const { width } = useRuneViewport();
  const phone = width < 600;
  const pages = useGameStore(dossierPages, same);
  const [open, setOpen] = useState<string | null>(null);
  const met = pages.species.filter((entry) => entry.met).length;
  const tamed = pages.species.filter((entry) => entry.tamed).length;
  const tamable = pages.species.filter((entry) => entry.tamable).length;
  const read = pages.notes.filter((note) => note.read);
  const shown = read.find((note) => note.id === open) ?? null;
  return (
    <RuneView layout={phone ? "stack" : "row"} gap={10} items="start">
      <Panel width={phone ? 370 : 520} label="Dossier">
        <Row justify="between"><Tag text="Dossier" /><Small color={INK} text={`${met}/${pages.species.length} met · ${tamed}/${tamable} tamed`} /></Row>
        <RuneView layout="grid" columns={phone ? 3 : 4} gap={4} scroll maxHeight={phone ? 260 : 420}>
          {pages.species.map((entry) => (
            <RuneView key={entry.id} padding={[4, 6, 4, 6]} radius={3} fill={entry.tamed ? "#1f3a2a" : "#161f22"} border={{ width: 1, color: entry.met ? HEAD : "#6fb7c922" }} opacity={entry.met ? 1 : 0.5}>
              <Small size={11} color={INK} text={`${entry.name}${entry.tamed ? " ✓" : ""}${entry.met && !entry.tamable ? " ☠" : ""}`} />
            </RuneView>
          ))}
        </RuneView>
      </Panel>
      <Panel width={phone ? 370 : 360}>
        <Row justify="between"><Tag text="Explorer notes" /><Small color={INK} text={`${read.length}/${pages.notes.length}`} /></Row>
        {read.length === 0 ? <Small text="Notes lie at caves, obelisks and summits. The map marks them with ✎." /> : null}
        <RuneView gap={3} scroll maxHeight={170}>
          {read.map((note) => <Button key={note.id} picked={note.id === open} justify="start" run={() => setOpen(note.id)}>{note.title}</Button>)}
        </RuneView>
        {shown === null ? null : <RuneView scroll maxHeight={220}><Small color={INK} text={shown.text} /></RuneView>}
      </Panel>
    </RuneView>
  );
}

/** Engrams shown at once: a page of the level-ordered list keeps the grid bounded. */
const ENGRAM_PAGE = 18;

/** ARK's engram screen: everything by level, a page at a time, learn with engram points. */
function Engrams(): ReactNode {
  const { width, height } = useRuneViewport();
  const phone = width < 600;
  const view = useGameStore((c) => { const v = liveSurvivor(c); return { level: v.level, points: v.engramPoints, engrams: v.engrams }; }, same);
  const lockedBy = useGameStore((c) => onboardingLock(c, "learn"));
  const ordered = useMemo(() => [...view.engrams].sort((a, b) => a.level - b.level), [view.engrams]);
  const pages = Math.max(1, Math.ceil(ordered.length / ENGRAM_PAGE));
  const firstOpen = Math.max(0, ordered.findIndex((engram) => !engram.learned && engram.level <= view.level));
  const [page, setPage] = useState(() => Math.floor(firstOpen / ENGRAM_PAGE));
  const shown = ordered.slice(page * ENGRAM_PAGE, (page + 1) * ENGRAM_PAGE);
  const band = (index: number) => { const slice = ordered.slice(index * ENGRAM_PAGE, (index + 1) * ENGRAM_PAGE); return `Lvl ${slice[0]?.level ?? 0}–${slice.at(-1)?.level ?? 0}`; };
  return (
    <Panel width={phone ? 370 : 760}>
      {lockedBy === null ? null : <Text size={13} color={GOLD} text={`Learning opens after: ${lockedBy}`} />}
      <Row justify="between"><Tag text="Engrams" /><Text size={13} text={`${view.points} engram points · level ${view.level}`} /></Row>
      <RuneView layout="grid" columns={phone ? 3 : 6} gap={4}>
        {Array.from({ length: pages }, (_, index) => <Button key={index} picked={index === page} minHeight={26} padding={[2, 6, 2, 6]} label={band(index)} run={() => setPage(index)}><Small color={INK} weight={600} text={band(index)} /></Button>)}
      </RuneView>
      <RuneView layout="grid" columns={phone ? 3 : 6} gap={6} scroll maxHeight={Math.max(240, height - 260)}>
        {shown.map((engram) => {
          const open = engram.level <= view.level;
          const affordable = open && lockedBy === null && !engram.learned && view.points >= engram.points;
          return (
            <RuneAction key={engram.id} label={`Learn ${itemLabel(engram.id)}`} tooltip={itemDef(engram.id)?.note ?? itemLabel(engram.id)} disabled={engram.learned || !affordable}
              padding={6} gap={4} items="center" radius={4} fill={engram.learned ? "#1f3a2a" : "#161f22"} hover="#ffffff18" opacity={open ? 1 : 0.45}
              border={{ width: 1, color: engram.learned ? "#7ad06a" : affordable ? HEAD : "#6fb7c933" }}
              command={{ name: "learn", input: { engramId: engram.id } }}>
              <ItemIcon itemId={engram.id} size={40} />
              <Small size={11} weight={700} color={INK} align="center" text={itemLabel(engram.id)} />
              <Small size={10} text={engram.learned ? "Learned" : open ? `${engram.points} EP` : `Level ${engram.level}`} />
            </RuneAction>
          );
        })}
      </RuneView>
    </Panel>
  );
}

/** ARK's remote inventory for a storage container: what it holds, slots used of its total. Take puts a stack back in your bag. */
function StoragePanel(): ReactNode {
  const store = useGameStore(storeView, same);
  if (store === null) return null;
  const used = store.slots.filter((slot) => slot !== null).length;
  return (
    <Panel width={340} label={store.label}>
      <Row justify="between"><Tag text={store.label} /><Small color={INK} text={`${used} / ${store.slots.length} slots`} /></Row>
      <RuneView gap={3} scroll maxHeight={360}>
        {used === 0 ? <Small text="Empty. Click your items to store them." /> : null}
        {store.slots.map((slot, index) =>
          slot === null ? null : (
            <Row key={index} gap={8}>
              <ItemIcon itemId={slot.itemId} size={28} />
              <Text size={13} grow={1} shrink text={`${itemLabel(slot.itemId)} × ${slot.count}`} />
              <Button label={`Take ${itemLabel(slot.itemId)}`} command={{ name: "storeTake", input: { slot: index } }}>Take</Button>
            </Row>
          ),
        )}
      </RuneView>
      <RuneView items="end"><Button command={{ name: "closeStore" }}>Close</Button></RuneView>
    </Panel>
  );
}

/** The Green Obelisk's terminal: each difficulty's level and tribute against what you carry, and its rewards. */
function ObeliskPanel(): ReactNode {
  const { width } = useRuneViewport();
  const phone = width < 600;
  const view = useGameStore(obeliskView, same);
  return (
    <Panel width={phone ? 370 : 760} fill="#0f1d17ee" border={{ width: 1, color: `${GREEN}66` }} gap={12} label="Green Obelisk">
      <Text size={18} weight={700} color={GREEN} text="Green Obelisk · Broodmother Lysrix" />
      <Small color={INK} text="Offer the tribute to open a portal to her lair. Everyone within range goes through when it opens, tames too." />
      <RuneView layout={phone ? "stack" : "row"} gap={10} items="stretch">
        {view.tiers.map((tier) => (
          <RuneView key={tier.id} grow={1} fill="#00000088" radius={4} padding={10} gap={6}>
            <Text weight={700} text={tier.label} />
            <Small color={tier.levelOk ? GOOD : BAD} text={`Survivor level ${tier.minLevel}`} />
            {tier.tribute.map((entry) => (
              <Row key={entry.item} gap={6}>
                <ItemIcon itemId={entry.item} size={28} />
                <Small color={INK} grow={1} shrink text={entry.label} />
                <Small color={entry.have >= entry.need ? GOOD : BAD} text={`${Math.min(entry.have, entry.need)}/${entry.need}`} />
              </Row>
            ))}
            <Small size={11} text={`Rewards: ${tier.rewards.map((entry) => `${entry.count} ${entry.label}`).join(", ")}`} />
            <RuneAction label={`Summon ${tier.label}`} padding={[6, 14, 6, 14]} radius={4} fill="#1f5a3a" border={{ width: 1, color: "#3fae6a" }} hover="#ffffff20" color="#eafff0" weight={700} items="center"
              disabled={!tier.ok || view.busy} command={{ name: "summonBoss", input: { tier: tier.id } }}>Summon</RuneAction>
          </RuneView>
        ))}
      </RuneView>
    </Panel>
  );
}

const TABS: readonly (readonly [SurvivorScreen, string])[] = [["inventory", "Inventory"], ["engrams", "Engrams"], ["dossier", "Dossier"]];

function Tabs({ tab }: { tab: SurvivorScreen }): ReactNode {
  const badges = useGameStore((c) => { const v = liveSurvivor(c); return { inventory: v.statPoints, engrams: v.engramPoints, dossier: 0 } as Record<string, number>; }, same);
  return (
    <Row gap={4}>
      {TABS.map(([id, label]) => (
        <Button key={id} picked={tab === id} label={label} command={{ name: "screen", input: { screen: id } }}>
          <Row gap={6}>
            <Tag color={INK} text={label.toUpperCase()} />
            {(badges[id] ?? 0) > 0 ? <Tag color={GOOD} text={String(badges[id])} /> : null}
          </Row>
        </Button>
      ))}
    </Row>
  );
}

/** ARK's full-screen survivor panels over the world; I or Esc closes them. */
export function InventoryScreen({ tab }: { tab: SurvivorScreen }): ReactNode {
  const ctx = useGameContext();
  const { width, height } = useRuneViewport();
  const phone = width < 600;
  useEffect(() => {
    if (typeof document !== "undefined") document.exitPointerLock?.();
  }, []);
  const bindings = useActionBindings();
  const closers = useMemo(() => { const inventory = bindings["inventory"]; return new Set(["Escape", ...(inventory === undefined ? [] : allActionCodes(inventory))]); }, [bindings]);
  const close = () => void ctx.game.commands.run("screen", { screen: null });
  const row = phone ? "stack" : "row";
  // Modal like ARK's inventory: the world stops taking keys, I/Tab/Esc close it, and play focus returns after.
  return (
    <RuneView anchor="fill" fill="#000000aa" modal onKey={(code) => { if (closers.has(code)) close(); }} label={`Screen ${tab}`}>
      <RuneView anchor="center" maxHeight={height - 12} scroll items="center" gap={10} padding={[8, 4, 8, 4]}>
        {tab === "creature" || tab === "storage" || tab === "obelisk" ? null : <Tabs tab={tab} />}
        {tab === "obelisk" ? (
          <ObeliskPanel />
        ) : tab === "creature" ? (
          <RuneView layout={row} gap={10} items="start"><Carried give="giveCreature" /><CreaturePanel /></RuneView>
        ) : tab === "storage" ? (
          <RuneView layout={row} gap={10} items="start"><Carried give="storePut" /><StoragePanel /></RuneView>
        ) : tab === "inventory" ? (
          <RuneView layout={row} gap={10} items="start"><Carried /><Survivor /><Crafting /></RuneView>
        ) : tab === "dossier" ? (
          <Dossier />
        ) : (
          <Engrams />
        )}
        <Row gap={10}>
          <Small color="#ccffee" text="I to close" />
          <Button run={close}>Close</Button>
        </Row>
      </RuneView>
    </RuneView>
  );
}
