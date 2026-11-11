/** @jsxImportSource @jgengine/core/ui/jsx */
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { useRuneViewport } from "@jgengine/core/ui/rune/elements.view";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { useActionBindings } from "@jgengine/core/input/actionBindings.view";
import { actionGlyph, useInputDevice } from "@jgengine/core/input/inputDevice.view";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useStore } from "@jgengine/react/store";
import { cityOf, phoneStore } from "../cityRuntime";
import { frontViews } from "../city/fronts";
import { payoffCost, turfViews } from "../city/street";
import { streetPlayOf } from "../streetPlay";
import { GIG_RACE_STAKE, gigStore } from "../jobs/gigs";
import { BurnerPhone, LcdLine } from "./BurnerPhone";
import { LcdText, Row, useRoom } from "./kit";
import { HH } from "./theme";

function readPhone(ctx: GameContext) {
  const world = cityOf(ctx);
  const factions = Object.entries(world.def.factions ?? {}).map(([id, faction]) => ({ id, label: faction.label ?? id, mood: Math.round(world.num(`${id}.mood`)) }));
  const stars = streetPlayOf(ctx).wanted().stars;
  const dee = world.fact("dee.known") === true && world.num("dee.trust") > -20;
  const gigs = gigStore.read(ctx);
  return {
    contacts: world.contacts(),
    news: [...world.log()].reverse().slice(0, 4),
    factions,
    turf: turfViews(ctx),
    fronts: frontViews(ctx).filter((front) => front.owned),
    takings: Math.floor(world.num("fronts.takings")),
    payoff: dee && stars > 0 ? payoffCost(stars) : null,
    gigs: { duty: gigs.duty, busy: gigs.view !== null, streak: gigs.streak, driving: streetPlayOf(ctx).drivingVehicleId() !== null },
  };
}

const moodWord = (mood: number) => (mood <= -40 ? "furious" : mood <= -10 ? "angry" : mood >= 20 ? "friendly" : "calm");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Head({ text }: { text: string }) {
  return <RuneView fill={HH.lcdInk} padding={[1, 6, 1, 6]}><LcdText size={12} color={HH.lcd} text={text.toUpperCase()} /></RuneView>;
}
function Line({ left, right, bad = false }: { left: string; right: string; bad?: boolean }) {
  return <Row justify="between" gap={8}><LcdText size={12} grow={1} shrink text={left} /><LcdText size={12} weight={800} color={bad ? "#9a1d0c" : HH.lcdInk} text={right} /></Row>;
}

/**
 * The burner's City app: a read of the town on the same handset as pause and settings. A message from
 * Dee sits on top while she can lose a report for you; then contacts and their jobs, how each crew
 * feels, who holds which block, what your fronts earn, and the news wire. It scrolls; the right
 * softkey (or T) puts it away.
 */
export function CityPhone() {
  const open = useStore(phoneStore, (v) => v === true);
  const { commands } = useGame();
  const keybinds = useActionBindings();
  const device = useInputDevice();
  const { height } = useRuneViewport();
  const compact = useRoom() !== "wide";
  const phone = useGameStore((ctx) => (open ? readPhone(ctx) : null), same);
  if (phone === null) return null;
  const glyph = device === "touch" ? null : actionGlyph(keybinds, "phone", device);
  const putAway = () => commands.run("phone", {});
  return (
    <BurnerPhone
      app="City"
      width={compact ? 270 : 300}
      softLeft={phone.payoff === null ? undefined : { label: "Pay Dee", run: () => commands.run("city.payoff", {}) }}
      softRight={{ label: glyph === null ? "Put away" : `Put away · ${glyph}`, run: putAway }}
    >
      <RuneView scroll maxHeight={Math.max(160, height - (compact ? 250 : 330))} gap={5} label="City">
        {phone.payoff === null ? null : (
          <RuneView gap={3} padding={6} border={{ width: 1, color: HH.lcdInk }}>
            <LcdText size={11} text="Dee · HHPD records" />
            <LcdText size={13} text={"“Cash and a report goes missing.”"} />
            <LcdLine label="Pay Dee to lose a report" run={() => commands.run("city.payoff", {})}><LcdText size={12} weight={800} text={`Pay Dee to lose a report · $${phone.payoff}`} /></LcdLine>
          </RuneView>
        )}
        {phone.contacts.map((contact) => (
          <RuneView key={contact.id} gap={2}>
            <LcdText weight={800} text={contact.name} />
            <LcdText size={12} text={`“${contact.line ?? "..."}”`} />
            {contact.jobs.filter((job) => job.status !== "done").map((job) => <Line key={job.id} left={job.title} right={job.status === "active" ? "on it" : job.status === "failed" ? "retry" : "open"} bad={job.status === "failed"} />)}
          </RuneView>
        ))}
        <Head text="Side work" />
        <Line left={`Taxi light${phone.gigs.streak > 0 ? ` · streak ${phone.gigs.streak}` : ""}`} right={phone.gigs.duty ? "on" : "off"} bad={!phone.gigs.duty} />
        <LcdLine label="Taxi light" disabled={!phone.gigs.driving && !phone.gigs.duty} run={() => commands.run("taxiDuty", {})}>
          <LcdText size={12} weight={800} text={phone.gigs.duty ? "▸ Switch the taxi light off" : phone.gigs.driving ? "▸ Work fares in this car" : "Get in a car to work fares"} />
        </LcdLine>
        <LcdLine label="Find a street race" disabled={!phone.gigs.driving || phone.gigs.busy} run={() => commands.run("gigs.race", {})}>
          <LcdText size={12} weight={800} text={`▸ Find a street race · ${GIG_RACE_STAKE} stake`} />
        </LcdLine>
        <Head text="Street" />
        {phone.factions.map((faction) => <Line key={faction.id} left={faction.label} right={`${moodWord(faction.mood)} (${faction.mood})`} bad={faction.mood <= -10} />)}
        <Head text="Turf" />
        {phone.turf.map((block) => (
          <Line key={block.id} left={block.label} bad={block.owner !== "player"}
            right={`${block.owner === "player" ? "yours" : block.owner === "riptide" ? "Riptide" : "Carmine"} · hold ${block.grip}${block.attacker !== "" && block.attacker !== block.owner ? ` · ${block.attacker === "player" ? "you" : block.attacker === "riptide" ? "Riptides" : "Carmines"} pushing` : ""}`} />
        ))}
        {phone.fronts.length > 0 ? <Head text={`Fronts · safe $${phone.takings}`} /> : null}
        {phone.fronts.map((front) => <Line key={front.slot} left={front.label} right={front.status === "raid" ? `RAID ${front.raidSeconds}s` : front.status === "wrecked" ? "wrecked" : `$${front.income}/s`} bad={front.status !== "open"} />)}
        {phone.news.length > 0 ? <Head text="News wire" /> : null}
        {phone.news.map((entry, i) => <LcdText key={`${entry.at}-${i}`} size={12} text={entry.text} />)}
      </RuneView>
    </BurnerPhone>
  );
}
