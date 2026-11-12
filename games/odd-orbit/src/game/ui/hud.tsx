/** @jsxImportSource @jgengine/core/ui/jsx */
import { useMemo } from "@jgengine/core/ui/jsx";
import { RuneFor, RuneGlyph, RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind, type RuneSource } from "@jgengine/core/ui/rune/primitives";
import { useGame, useGameCalendar, useGameClock, useGameStore, useSceneObjects } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";
import type { GameContext } from "@jgengine/core/runtime/gameContext";

import { householdStore } from "../session/store";
import type { HouseholdState, PendingIncident } from "../session/types";
import { nextBill } from "../sim/economy";
import { dayGoal } from "../sim/goal";
import { householdPhase } from "../sim/schedule";
import { activeGoalLabel } from "../sim/simulate";
import { charterGrade, charterOf, GOALS_TO_PASS, STRIKES_TO_EVICT, TERM_DAYS, TERMS, termGoals } from "../sim/charter";
import { rentFor } from "../sim/economy";
import { ANSWER_SECONDS, incidentDef } from "../sim/events";
import { NEEDS } from "../needs/needs";
import type { Live } from "@jgengine/core/ui/liveValue";
import { ENAMEL, type EnamelTone, Fine, Heading, Icon, INK, Meter, NEED_COLORS, Paper, Plate, RIM, Row, Swatch, Tag, Text, Veil, WARN, creditsText, planColor } from "./kit";
import type { GameIconName } from "@jgengine/core/ui/icons/gameIcons.view";

const PHASE_WORD: Record<string, string> = { torpor: "Torpor", yield: "Yield hours", bloom: "Bloom hours", bond: "Bonding hours" };
const pad2 = (n: number) => String(n).padStart(2, "0");

/** The day's rhythm on a 24-hour dial: torpor, Yield, Bloom and bonding hours. */
const DIAL_PHASES: readonly { from: number; to: number; color: string }[] = [
  { from: 22, to: 32, color: "#5b4a7a" }, { from: 8, to: 14, color: "#ffc76e" }, { from: 14, to: 18, color: "#8fdcb8" }, { from: 18, to: 22, color: "#f6a6cf" },
];
const dialAt = (h: number, r: number): [number, number] => { const t = ((h / 24) * 360 + 180) * (Math.PI / 180); return [50 + r * Math.sin(t), 50 - r * Math.cos(t)]; };
const wedge = (from: number, to: number, r: number) => { const [x0, y0] = dialAt(from, r), [x1, y1] = dialAt(to, r); return `M50 50L${x0} ${y0}A${r} ${r} 0 ${to - from > 12 ? 1 : 0} 1 ${x1} ${y1}Z`; };
const TICKS = Array.from({ length: 24 }, (_, i) => { const [x1, y1] = dialAt(i, 44), [x2, y2] = dialAt(i, i % 6 === 0 ? 37 : 41); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${i % 6 === 0 ? 2.6 : 1.2}"/>`; }).join("");

/** A 24-hour wall clock: midnight at the foot, noon at the crown, the shift hours painted on. */
function WallClock({ size }: { size: number }) {
  // The hand steps every ten game minutes; only this small dial re-renders.
  const step = useGameCalendar((c) => Math.floor((c.hour * 60 + c.minute) / 10));
  const angle = ((step * 10) / 1440) * 360 + 180;
  const layer = (art: string, color: string) => <RuneView pin={[0, 0, null, null]} width={size} height={size}><RuneGlyph size={size} color={color} artwork={`<g transform="scale(0.24)">${art}</g>`} /></RuneView>;
  return <RuneView width={size} height={size} label="Wall clock">
    {layer(`<circle cx="50" cy="50" r="47" fill="currentColor"/>`, RIM)}
    {layer(`<circle cx="50" cy="50" r="44" fill="currentColor"/>`, ENAMEL.cream)}
    {DIAL_PHASES.map((p) => <RuneView key={p.from} pin={[0, 0, null, null]}>{layer(`<path d="${wedge(p.from, p.to, 38)}" fill="currentColor"/>`, p.color)}</RuneView>)}
    {layer(`<circle cx="50" cy="50" r="26" fill="currentColor"/>`, ENAMEL.cream)}
    {layer(`<g stroke="currentColor" stroke-linecap="round">${TICKS}</g><path d="M50 50L50 14" stroke="currentColor" stroke-width="4" stroke-linecap="round" transform="rotate(${angle} 50 50)"/>`, RIM)}
    {layer(`<circle cx="50" cy="50" r="5" fill="currentColor"/>`, ENAMEL.pink)}
  </RuneView>;
}

/** The kitchen wall: the clock, a tear-off calendar and the speed knobs. */
export function HouseClock({ compact }: { compact: boolean }) {
  const ctx = useGameContext();
  const clock = useGameClock();
  const { commands } = useGame();
  const day = useGameCalendar((c) => c.day);
  const phase = useGameStore((c) => householdPhase(c.time.now()));
  return <Row gap={10} items="start" label="Household time">
    <WallClock size={compact ? 60 : 84} />
    <RuneView gap={6}>
      <Paper padding={[6, 12, 8, 12]} gap={0} items="center" minWidth={compact ? 84 : 104}>
        <Tag color="#c2477f">{`DAY ${day + 1}`}</Tag>
        <Text family="Comfortaa" weight={700} size={compact ? 20 : 26} text={bind(() => { const c = ctx.time.calendar(); return `${pad2(Math.floor(c.hour))}:${pad2(c.minute)}`; })} />
        <Fine>{PHASE_WORD[phase] ?? phase}</Fine>
      </Paper>
      <Row gap={4} label="Simulation speed">
        <Plate tone={clock.paused ? "butter" : "cream"} on={clock.paused} minHeight={30} padding={[4, 9, 4, 9]} radius={99} label={clock.paused ? "Resume time" : "Pause time"} onPress={() => commands.run("pauseToggle", {})}><Icon name={clock.paused ? "arrowRight" : "pause"} size={14} /></Plate>
        {clock.speeds.map((mult) => <Plate key={mult} tone={!clock.paused && clock.speed === mult ? "pink" : "cream"} on={!clock.paused && clock.speed === mult} minHeight={30} padding={[4, 8, 4, 8]} radius={99} size={13} label={`Speed ${mult}x`} onPress={() => commands.run("time.speed", { mult })}>{`${mult}×`}</Plate>)}
      </Row>
    </RuneView>
  </Row>;
}

function Magnet({ tone, icon, value, unit, label }: { tone: EnamelTone; icon: GameIconName; value: Live<string>; unit: string; label: string }) {
  return <Row fill={ENAMEL[tone]} radius={14} border={{ width: 2, color: RIM }} padding={[5, 10, 5, 7]} gap={5} label={label}>
    <Icon name={icon} size={18} /><Text family="Comfortaa" weight={700} size={17} text={value} /><Fine color={INK}>{unit}</Fine>
  </Row>;
}

/** The fridge door: credits, rations and the midnight bill, with the day's note pinned under them. */
export function FridgeMagnets({ compact }: { compact: boolean }) {
  const ctx = useGameContext();
  const objects = useSceneObjects();
  const door = useStore(householdStore, (s) => { const due = nextBill(s, objects); return { pantry: s.pantry, debt: s.debt, bill: Math.round(due), short: s.credits < due }; });
  return <RuneView gap={6} items="end" label="Household resources">
    <RuneView layout={compact ? "stack" : "row"} gap={5} items="end">
      <Magnet tone={door.short ? "coral" : "butter"} icon="coin" value={bind(() => creditsText(Math.floor(householdStore.read(ctx).credits)))} unit="credits" label="Credits" />
      <Magnet tone={door.pantry < 4 ? "coral" : "mint"} icon="bread" value={String(door.pantry)} unit="rations" label="Rations" />
      <Magnet tone={door.short ? "coral" : "cream"} icon="hourglass" value={String(door.bill)} unit="midnight bill" label="Due at midnight" />
      {door.debt > 0 ? <Magnet tone="coral" icon="debuffArrow" value={creditsText(door.debt)} unit="debt" label="Debt" /> : null}
    </RuneView>
    {compact ? null : <Paper tint="#fff3b8" padding={[8, 12, 8, 12]} maxWidth={330}><Text size={14} text={bind(() => dayGoal(householdStore.read(ctx), ctx.scene.object.list()).replace(/^Next:\s*/, ""))} /></Paper>}
  </RuneView>;
}

/** The Authority's charter pinned under the fridge: the term, its three goals and the strikes so far. */
export function CharterNote({ compact }: { compact: boolean }) {
  const objects = useSceneObjects();
  const note = useStore(householdStore, (household) => {
    const charter = charterOf(household), grade = charterGrade(charter);
    if (charter.outcome !== "active") return { outcome: charter.outcome, grade, term: 0, strikes: 0, dayOfTerm: 0, rent: 0, goals: [] };
    const sheet = termGoals(household, objects);
    return {
      outcome: charter.outcome, grade, term: charter.term, strikes: charter.strikes, dayOfTerm: household.day - charter.term * TERM_DAYS + 1, rent: rentFor(household),
      goals: sheet.statuses.map((status, i) => { const goal = sheet.goals[i]!; return { id: goal.id, label: goal.label, met: status.met, text: goal.metric === "debtFree" ? (status.met ? "clear" : "in debt") : `${Math.min(status.value, status.target)}/${status.target}` }; }),
    };
  });
  if (note.outcome !== "active") return <Paper tint="#d9f2e4" padding={[8, 12, 8, 12]} gap={2} role="status">
    <Row gap={6}><Icon name="flag" size={15} /><Text weight={700}>{note.outcome === "kept" ? `Charter kept · ${note.grade.word}` : "Evicted"}</Text></Row>
    <Fine>{`${note.grade.stars} of ${note.grade.of} goals across the charter`}</Fine>
  </Paper>;
  const term = TERMS[note.term]!;
  return <Paper tint="#e8f0ff" padding={[8, 12, 9, 12]} gap={3} width={compact ? 186 : 300} label="Habitat charter">
    <RuneView layout={compact ? "stack" : "row"} gap={compact ? 3 : 6} justify="between"><Row gap={6}><Icon name="scroll" size={15} /><Text weight={700} size={14}>{`Term ${note.term + 1}/${TERMS.length} · ${term.name}`}</Text></Row>
      <Row gap={3} label={`${note.strikes} of ${STRIKES_TO_EVICT} strikes`}>{Array.from({ length: STRIKES_TO_EVICT }, (_, i) => <RuneView key={i} width={9} height={9} radius={5} border={{ width: 1.5, color: RIM }} fill={i < note.strikes ? "#ff6b7d" : "#ffffff"} />)}</Row></RuneView>
    <Fine size={12}>{`Day ${Math.min(TERM_DAYS, note.dayOfTerm)} of ${TERM_DAYS} · rent ${note.rent} a night · meet ${GOALS_TO_PASS} of 3`}</Fine>
    {compact ? null : note.goals.map((goal) => <Row key={goal.id} gap={6}><Icon name={goal.met ? "check" : "hourglass"} size={13} color={goal.met ? "#2f9a62" : INK} /><Text size={13} grow={1}>{goal.label}</Text><Text size={13} weight={700}>{goal.text}</Text></Row>)}
  </Paper>;
}

const INCIDENT_ICON: Record<string, GameIconName> = { trader: "coin", overtime: "hourglass", dust: "leaf", brownout: "lightning", spoilage: "poison", traveller: "hand", quarrel: "fist", fever: "potionRed", meteor: "fire", hullLeak: "frost" };

/** A transmission slip from the Authority's relay: what happened, the household's answers and the fuse. */
export function TransmissionSlip({ width }: { width: number }) {
  const ctx = useGameContext();
  const { commands } = useGame();
  const slip = useStore(householdStore, (household) => {
    const pending: PendingIncident | null | undefined = household.incident;
    if (pending == null) return null;
    const def = incidentDef(pending.id);
    if (def?.choices === undefined) return null;
    return { id: def.id, title: def.title, text: def.text(household, pending), fallback: def.fallback, deadline: pending.deadline,
      choices: def.choices.map((c) => ({ id: c.id, label: c.label, blocked: c.blocked?.(household, pending) ?? null, detail: c.detail(household, pending) })) };
  });
  if (slip === null) return null;
  const left = () => Math.max(0, slip.deadline - ctx.time.now());
  return <Paper width={width} padding={[14, 16, 16, 16]} gap={8} role="alertdialog" label={`Transmission: ${slip.title}`}>
    <Row gap={10}><RuneView width={36} height={36} radius={18} fill={ENAMEL.coral} border={{ width: 2, color: RIM }} justify="center" items="center"><Icon name={INCIDENT_ICON[slip.id] ?? "flag"} size={20} /></RuneView>
      <RuneView gap={0} grow={1}><Tag>INCOMING TRANSMISSION</Tag><Heading size={19}>{slip.title}</Heading></RuneView></Row>
    <Text size={14}>{slip.text}</Text>
    <RuneView layout="grid" columns={2} responsive={{ phone: { columns: 1 } }} gap={6} label="Answers">
      {slip.choices.map((choice) => { const fallback = choice.id === slip.fallback; return <Plate key={choice.id} tone={fallback ? "cream" : "mint"} disabled={choice.blocked !== null} layout="stack" gap={1} items="start" onPress={() => commands.run("incident.answer", { choice: choice.id })}>
        <Text weight={700}>{choice.label}</Text><Fine size={12} color={INK}>{`${choice.blocked ?? choice.detail}${fallback ? " · default" : ""}`}</Fine></Plate>; })}
    </RuneView>
    <RuneView label="Time to answer" gap={3}>
      <Meter value={() => (left() / ANSWER_SECONDS) * 100} color="#ff9e8c" width={{ fraction: 1 }} height={6} />
      <Fine size={12} text={bind(() => `${Math.ceil(left())} seconds to answer`)} />
    </RuneView>
  </Paper>;
}

/** The Authority's letter at the close of a term, or the notice that ends the charter. */
export function TermLetter() {
  const { commands } = useGame();
  const letter = useStore(householdStore, (household) => {
    const charter = charterOf(household), review = charter.review;
    if (review === null) return null;
    return { review: { ...review, met: [...review.met], missed: [...review.missed] }, strikes: charter.strikes, grade: charterGrade(charter) };
  });
  if (letter === null) return null;
  const { review, grade } = letter;
  const evicted = review.outcome === "evicted", kept = review.outcome === "kept";
  const title = evicted ? "Notice of eviction" : kept ? "Charter kept" : `Term ${review.term + 1} review`;
  return <Veil label={title}>
    <Tag>HABITAT AUTHORITY · RING FOUR</Tag>
    <Heading size={26}>{title}</Heading>
    {review.reason !== undefined ? <Text color={WARN}>{review.reason}</Text> : null}
    {review.met.map((label) => <Row key={label} gap={6}><Icon name="check" size={14} color="#2f9a62" /><Text>{label}</Text></Row>)}
    {review.missed.map((label) => <Row key={label} gap={6}><Icon name="cross" size={14} color={WARN} /><Text>{label}</Text></Row>)}
    {evicted ? null : <Text>{`Grant paid: ${review.grant} credits.${review.strike ? " Fewer than two goals were met — the household carries a strike." : ""}`}</Text>}
    {!evicted && !kept ? <Text>{`Next term: ${TERMS[review.term + 1]!.name}. Rent rises to ${TERMS[review.term + 1]!.rent} a night. Strikes: ${letter.strikes} of ${STRIKES_TO_EVICT}.`}</Text> : null}
    {kept ? <Text>{`The household is ${grade.word} on Ring Four: ${grade.stars} of ${grade.of} goals met across four terms. The habitat is yours to keep living in.`}</Text> : null}
    {evicted ? <Text>{`The household met ${grade.stars} of ${grade.of} goals before the Authority closed the door. A new household can move in from the menu.`}</Text> : null}
    {evicted
      ? <Plate tone="coral" onPress={() => commands.run("orbit.pause", {})}><Icon name="menu" size={16} /><Text weight={700}>Back to the menu</Text></Plate>
      : <Plate tone="mint" onPress={() => commands.run("charter.dismiss", {})}><Icon name="check" size={16} /><Text weight={700}>{kept ? "Keep living here" : "Carry on"}</Text></Plate>}
  </Veil>;
}

function companyName(household: HouseholdState, id: string): string {
  const member = household.members[id];
  if (member === undefined) return "";
  const company = member.action.kind === "wander" && member.action.company !== undefined ? household.members[member.action.company]?.name : undefined;
  return activeGoalLabel(member, company);
}

/** The household's member ids as a bounded, subscribed slice: a new array only when someone arrives or leaves. */
function rosterSource(ctx: GameContext): RuneSource<string> {
  let last: string[] = [];
  return {
    read: () => { const order = householdStore.read(ctx).order; if (order.length !== last.length || order.some((id, i) => id !== last[i])) last = [...order]; return last; },
    subscribe: (listener) => ctx.subscribe(listener),
  };
}

/** One enamel magnet per being, in their own colour, with their four needs and what they are doing. */
export function RosterPanel({ compact }: { compact: boolean }) {
  const ctx = useGameContext();
  const source = useMemo(() => rosterSource(ctx), [ctx]);
  return <RuneView gap={8} label="Household"><RuneFor source={source} keyBy={(id) => id}>{(id) => <MemberMagnet id={id} compact={compact} />}</RuneFor></RuneView>;
}

function MemberMagnet({ id, compact }: { id: string; compact: boolean }) {
  const ctx = useGameContext();
  const { commands } = useGame();
  const member = () => householdStore.read(ctx).members[id];
  const fixed = useStore(householdStore, (s) => { const m = s.members[id]; return m === undefined ? null : { name: m.name, plan: m.bodyPlan, concern: m.concern, recovering: m.recovering }; });
  if (fixed === null) return null;
  const selected = () => householdStore.read(ctx).selectedMemberId === id;
  return <RuneView gap={3} items="start">
    <Plate tint={planColor(fixed.plan, 82)} radius={20} padding={[6, 10, 6, 6]} width={compact ? 160 : 240} justify="start" clip label={`${fixed.name} card`}
      border={bind(() => ({ width: selected() ? 3 : 2, color: selected() ? "#ffd98a" : RIM }))} onPress={() => commands.run("member.select", { id: selected() ? null : id })}>
      <Swatch plan={fixed.plan} size={compact ? 32 : 40} />
      <RuneView gap={2} grow={1} shrink>
        <Row gap={4} justify="between"><Text weight={700} size={compact ? 12 : 14} shrink>{fixed.name}</Text>
          <RuneView hidden={bind(() => { const m = member(); return m === undefined || (!m.recovering && Math.min(...Object.values(m.needs)) >= 25); })}><Icon name="heart" size={13} color={WARN} /></RuneView></Row>
        <Fine size={compact ? 11 : 12} color="#4a2f52" text={bind(() => companyName(householdStore.read(ctx), id))} />
        <Row gap={3}>{NEEDS.map((need) => <Meter key={need} label={need} width={compact ? 26 : 36} height={5} value={() => member()?.needs[need] ?? 0} color={bind(() => (member()?.needs[need] ?? 0) < 30 ? "#ff6b7d" : NEED_COLORS[need])} />)}</Row>
      </RuneView>
    </Plate>
    {fixed.concern && !compact ? <RuneView fill="#fff3b8" border={{ width: 1, color: "#6b4c3a" }} radius={4} padding={[3, 8, 3, 8]} maxWidth={232}><Fine size={12} color={INK}>{fixed.concern}</Fine></RuneView> : null}
  </RuneView>;
}
