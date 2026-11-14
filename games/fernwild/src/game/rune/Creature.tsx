/** @jsxImportSource @jgengine/core/ui/jsx */
import type { ReactNode } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";

import { viewedBreeding } from "../breeding";
import type { CreatureCard } from "../creatures";
import { itemLabel } from "../data/items";

import { ItemIcon } from "./ItemIcon";
import { botProfile, CHIPS, TEMPERAMENT_GLOW } from "../data/bots";
import { chargeWear, tameFood } from "../tameHunger";
import { Button, GOOD, INK, Meter, Panel, Row, Small, Tag, Text } from "./kit";
import { liveCreatures, same } from "./live";

const NARCOTIC = new Set(["narcoberry", "drain_spike", "stimberry", "stimulant"]);

/** A card with its per-frame numbers zeroed: what decides which rows a readout shows, so it re-renders only when they change. */
export function cardShape(card: CreatureCard): CreatureCard {
  const zero = { value: 0, max: 0 };
  return { ...card, health: zero, stamina: zero, weight: zero, taming: card.taming === null ? null : { ...card.taming, torpor: card.taming.torpor > 0 ? 1 : 0, progress: 0, wakesIn: 0, nextMeal: 0, effectiveness: 0 } };
}

/** Hours and minutes, the way ARK shows breeding timers. */
function clock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${Math.floor(seconds % 60)}s`;
}

/**
 * ARK's look-at readout: name and level, health, and while it is down its torpor and taming. `card` decides
 * which rows show; `read` feeds their changing numbers each frame.
 */
export function CreatureReadout({ card, read }: { card: CreatureCard; read: () => CreatureCard | null }): ReactNode {
  const ctx = useGameContext();
  const live = () => read() ?? card;
  const taming = card.taming;
  const status = card.dead ? " · Dead" : card.puppeted ? " · PUPPETED" : card.tamed ? " · Uploaded" : taming?.unconscious === true ? " · Offline" : "";
  return (
    <RuneView gap={4} width={220} label={card.label}>
      <Text weight={700} size={14} color={INK} text={`${card.label} · ${card.sex === "female" ? "female" : "male"} · Lvl ${card.level}${status}`} />
      {card.tamed || card.dead ? null : <Small color={TEMPERAMENT_GLOW[card.temperament]} text={instinctLine(card)} />}
      {card.tamed && card.helper !== null ? <Small color={GOOD} text={card.helper} /> : null}
      {card.imprint > 0 || card.mutations > 0 ? (
        <Small color={INK} text={[card.imprint > 0 ? `Imprinted ${Math.round(card.imprint * 100)}%` : "", card.mutations > 0 ? `${card.mutations} glitch${card.mutations === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")} />
      ) : null}
      {card.dead ? null : <Meter label="Health" value={() => live().health.value} max={() => live().health.max} color="#d8483f" />}
      {card.tamed && !card.dead ? <Meter label="Stamina" value={() => live().stamina.value} max={() => live().stamina.max} color="#e7c84a" /> : null}
      {card.tamed && !card.dead ? <Meter label="Weight" value={() => live().weight.value} max={() => live().weight.max} color="#a3a3a3" /> : null}
      {card.tamed && !card.dead && tameFood(ctx, card.id) !== null ? (
        <Meter label={() => ((tameFood(ctx, card.id)?.value ?? 0) <= 0 ? "Charge · dead cell" : chargeWear(ctx, card.id) === "rust" ? "Charge · rusting in the wet" : chargeWear(ctx, card.id) === "heat" ? "Charge · overheating" : "Charge")} value={() => tameFood(ctx, card.id)?.value ?? 0} max={() => tameFood(ctx, card.id)?.max ?? 1} color="#d79a3c" />
      ) : null}
      {taming !== null && (taming.unconscious || taming.torpor > 0) ? <Meter label="Discharge" value={() => live().taming?.torpor ?? 0} max={() => live().taming?.maxTorpor ?? 1} color="#a45fd6" /> : null}
      {taming !== null && taming.unconscious ? (
        <>
          <Meter label="Upload" value={() => Math.round((live().taming?.progress ?? 0) * 100)} max={() => 100} color="#7ad06a" />
          <Small color={INK} text={bind(() => `Upload integrity ${Math.round((live().taming?.effectiveness ?? 0) * 100)}%`)} />
        </>
      ) : null}
    </RuneView>
  );
}

const TEMPERAMENT_WORD = { passive: "Passive", skittish: "Skittish", territorial: "Territorial", aggressive: "Aggressive", pack: "Pack hunter", ambush: "Ambusher", retaliator: "Retaliator" } as const;
const TARGET_WORD = { loudest: "the loudest", brightest: "lights", richest: "cargo", weakest: "the wounded", machines: "other machines", attacker: "whoever hit it", biggest: "the biggest machine" } as const;

/** What a wild bot is, in its eye colour: temperament, who it goes for, and Overclocked in a storm. */
function instinctLine(card: CreatureCard): string {
  const profile = botProfile(card.species);
  const targets = profile === null || profile.targets.length === 0 ? "" : ` · goes for ${profile.targets.map((rule) => TARGET_WORD[rule]).join(", then ")}`;
  return `${TEMPERAMENT_WORD[card.temperament]}${targets}${card.dormant ? " · dormant" : ""}${card.conductor ? " · CONDUCTOR" : ""}${card.overclocked ? " · OVERCLOCKED" : ""}`;
}

/** ARK's tame stats: level and XP to the next, then each stat with a + while points are unspent. */
function TameSheet({ growth }: { growth: NonNullable<CreatureCard["growth"]> }): ReactNode {
  return (
    <RuneView gap={3}>
      {growth.maxed ? (
        <Small color={INK} text={`Uploaded at level ${growth.tamedAt} · +${growth.gained} levels, the most it can gain`} />
      ) : (
        <Meter label={`Uploaded at ${growth.tamedAt} · +${growth.gained} levels · XP`} value={() => growth.xp} max={() => growth.xpNext} color="#7ad06a" />
      )}
      {growth.unspent > 0 ? <Text size={12} weight={700} color={GOOD} text={`▲ ${growth.unspent} point${growth.unspent === 1 ? "" : "s"} to spend`} /> : null}
      {growth.stats.map((stat) => (
        <Row key={stat.id} gap={6}>
          <Small color={INK} grow={1} text={stat.label} />
          <Small color={INK} text={`${stat.value}${stat.unit}`} />
          {growth.unspent > 0 ? <Button label={`Level ${stat.label}`} tooltip={`+${stat.gain}${stat.unit}`} minHeight={22} padding={[0, 8, 0, 8]} command={{ name: "levelTame", input: { stat: stat.id } }}>+</Button> : null}
        </Row>
      ))}
    </RuneView>
  );
}

/** A bred creature's lineage: each wild stat's levels and the parent they came from, a mutation marked. */
function LineageSheet({ rows }: { rows: NonNullable<CreatureCard["lineage"]> }): ReactNode {
  return (
    <RuneView gap={2}>
      <Small text="Inherited levels" />
      {rows.map((row) => (
        <Row key={row.stat} gap={6}>
          <Small color={INK} grow={1} text={row.label} />
          <Small color={INK} text={String(row.levels)} />
          <Small width={110} align="right" color={row.mutated ? "#d79cff" : "#9fb9bd"} text={`${row.from === "both" ? "both parents" : `from ${row.from}`}${row.mutated ? " +mutation" : ""}`} />
        </Row>
      ))}
    </RuneView>
  );
}

/** Breeding on the creature screen: the mating switch, mating and pregnancy, or a baby's growing, food and imprint. */
function BreedingPanel({ mating }: { mating: boolean }): ReactNode {
  const ctx = useGameContext();
  const card = useGameStore((c) => { const b = viewedBreeding(c); return b === null ? null : { baby: b.baby !== null, breeds: b.breeds, mode: b.mode, incubation: b.incubation, mating: b.mating !== null, pregnancy: b.pregnancy !== null, cooldown: b.cooldown > 0 }; }, same);
  if (card === null) return null;
  const live = () => viewedBreeding(ctx);
  if (card.baby) {
    const baby = () => live()?.baby ?? null;
    return (
      <RuneView gap={4}>
        <Meter label={() => { const b = baby(); return b === null ? "" : `${b.stage[0]!.toUpperCase()}${b.stage.slice(1)} · grown in ${clock(b.secondsLeft)}`; }} value={() => Math.round((baby()?.matured ?? 0) * 100)} max={() => 100} color="#6fb7c9" />
        <Meter label="Imprinting" value={() => Math.round((baby()?.imprint ?? 0) * 100)} max={() => 100} color="#e58fd0" />
        <Small color={INK} text={bind(() => { const b = baby(); return b === null ? "" : b.wants === null ? `Next wants care in ${clock(b.nextCare)}` : `Wants: ${b.wants}`; })} />
        <Small text="It eats biogel or berries you put in its inventory, faster while small." />
      </RuneView>
    );
  }
  if (!card.breeds) return <Small text="This kind does not forge." />;
  return (
    <RuneView gap={4}>
      <Row gap={8}>
        <Small color={INK} grow={1} shrink text={`Mating: ${mating ? "on" : "off"}${card.incubation !== null ? ` · eggs need ${card.incubation[0]}–${card.incubation[1]} °C` : card.mode === "carry" ? " · carries its young" : ""}`} />
        <Button command={{ name: "toggleMating" }}>{mating ? "Disable mating" : "Enable mating"}</Button>
      </Row>
      {card.mating ? <Meter label="Mating" value={() => Math.round((live()?.mating ?? 0) * 100)} max={() => 100} color="#e58fd0" /> : null}
      {card.pregnancy ? <Meter label={() => `Gestation · born in ${clock(live()?.pregnancy?.secondsLeft ?? 0)}`} value={() => Math.round((live()?.pregnancy?.progress ?? 0) * 100)} max={() => 100} color="#e58fd0" /> : null}
      {card.cooldown ? <Small color={INK} text={bind(() => `Can mate again in ${clock(live()?.cooldown ?? 0)}`)} /> : null}
    </RuneView>
  );
}

/** Its favourite first (ARK's firmware tier), then the plain foods it also takes; the other firmware tiers go unsaid. */
function hungryLine(foods: readonly string[]): string {
  const [best, ...rest] = foods;
  if (best === undefined) return "It eats nothing you can give it.";
  const plain = rest.filter((item) => !item.startsWith("firmware_"));
  return plain.length === 0 ? `Hungry — give it ${itemLabel(best)}.` : `Hungry — it uploads best on ${itemLabel(best)}; it also eats ${plain.map(itemLabel).join(", ")}.`;
}

const STANCE_LINE = { passive: "Passive chip: never fights, even when hit", neutral: "Escort chip: fights what threatens you or itself", aggressive: "Aggressive chip: goes for any wild machine it sees" } as const;

/** ARK's remote inventory: the creature's own items, taming state, saddle and orders. Take puts an item back in your bag. */
export function CreaturePanel(): ReactNode {
  const ctx = useGameContext();
  const card = useGameStore((c) => {
    const v = liveCreatures(c).viewing;
    return v === null ? null : cardShape(v);
  }, same);
  if (card === null) return null;
  const read = () => liveCreatures(ctx).viewing;
  const taming = card.taming;
  return (
    <Panel width={380} responsive={{ phone: { width: 360 } }} label={`${card.label} inventory`}>
      <Tag text={`${card.label} inventory`} />
      <CreatureReadout card={card} read={read} />
      {taming !== null ? (
        <RuneView gap={2}>
          <Small color={INK} text={bind(() => { const t = read()?.taming; return t == null ? "" : t.eating === null ? hungryLine(t.foods) : `Eats ${itemLabel(t.eating)} in ${t.nextMeal}s.`; })} />
          {taming.unconscious ? <Small color={INK} text={bind(() => `Wakes in ${clock(read()?.taming?.wakesIn ?? 0)} unless you keep it under.`)} /> : null}
          <Small text="Keep its discharge up with Narcoberries or Drain Spikes: put them in, then Feed." />
        </RuneView>
      ) : null}
      {card.saddle !== null && card.tamed ? (
        <Row>
          <Small color={INK} grow={1} shrink text={`Rig: ${card.saddled ? itemLabel(card.saddle) : `none — needs a ${itemLabel(card.saddle)}`}`} />
          {card.saddled ? <Button command={{ name: "unsaddle" }}>Remove</Button> : null}
        </Row>
      ) : null}
      {card.traits.length > 0 ? (
        <RuneView gap={2}>
          {card.traits.map((trait) => (
            <Small key={trait.id} color={trait.kind === "good" ? "#7ad06a" : trait.kind === "bad" || trait.kind === "quirk" ? "#e0a05a" : "#b98cff"} text={`${trait.kind === "quirk" ? "Quirk" : "Glitch"}: ${trait.label}. ${trait.note}`} />
          ))}
        </RuneView>
      ) : null}
      {card.tamed ? (
        <RuneView gap={4}>
          <Tag text="Behaviour chips" />
          <Row gap={6}>
            <Small color={INK} grow={1} text={card.order === "follow" ? "Follow: at your heel" : "Guard Zone: holds and defends this spot"} />
            <Button picked={card.order === "follow"} command={{ name: "whistleFollow" }}>Follow (T)</Button>
            <Button picked={card.order !== "follow"} command={{ name: "whistleStay" }}>Guard Zone (U)</Button>
          </Row>
          <Small color={INK} text={STANCE_LINE[card.stance ?? "neutral"]} />
          <Row gap={6}>
            {(["passive", "neutral", "aggressive"] as const).map((stance) => (
              <Button key={stance} picked={card.stance === stance} command={{ name: `whistle${stance[0]!.toUpperCase()}${stance.slice(1)}` }}>{CHIPS.find((chip) => chip.id === stance)?.label ?? stance}</Button>
            ))}
          </Row>
        </RuneView>
      ) : null}
      {card.tamed && card.harvester ? (
        <Row gap={6}>
          <Small color={INK} grow={1} shrink text={card.harvesting ? "Harvest chip: working the ground around its post into its inventory" : "Harvest chip: on Guard Zone it gathers its specialty by itself"} />
          <Button picked={card.harvesting} command={{ name: "toggleHarvest" }}>{card.harvesting ? "Harvest: on" : "Harvest: off"}</Button>
        </Row>
      ) : null}
      {card.tamed && card.courier ? (
        <Row gap={6}>
          <Small color={INK} grow={1} shrink text="Courier: load it, and it flies the cargo to your nearest storage box." />
          <Button command={{ name: "sendHome" }}>Fly cargo home</Button>
        </Row>
      ) : null}
      {card.tamed ? <BreedingPanel mating={card.mating} /> : null}
      {card.growth !== null ? <TameSheet growth={card.growth} /> : null}
      {card.lineage !== null ? <LineageSheet rows={card.lineage} /> : null}
      <RuneView gap={3} maxHeight={240} scroll>
        {card.inventory.every((slot) => slot === null) ? <Small text="Empty. Click your items to give them." /> : null}
        {card.inventory.map((slot, index) =>
          slot === null ? null : (
            <Row key={index} gap={8}>
              <ItemIcon itemId={slot.itemId} size={28} />
              <Text size={13} grow={1} shrink text={`${itemLabel(slot.itemId)} × ${slot.count}`} />
              {NARCOTIC.has(slot.itemId) && taming !== null ? <Button command={{ name: "feedNarcotic", input: { itemId: slot.itemId } }}>Feed</Button> : null}
              <Button label={`Take ${itemLabel(slot.itemId)}`} command={{ name: "takeCreature", input: { slot: index } }}>Take</Button>
            </Row>
          ),
        )}
      </RuneView>
      <RuneView items="end"><Button command={{ name: "closeCreature" }}>Close</Button></RuneView>
    </Panel>
  );
}
