/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "@jgengine/core/ui/jsx";
import type { Live } from "@jgengine/core/ui/liveValue";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import type { SceneObject } from "@jgengine/core/scene/objectStore";
import { useGame, useGameStore, useSceneObjects } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";

import { NEEDS, NEED_DEFS } from "../needs/needs";
import { moodOfNeeds, bondWord, householdBook } from "../agents";
import { bloomHarvestIn, careerView, postRows, rungProgressIn, stationPayIn, STATION_NAME, yieldShiftValue, RUNG_NAMES } from "../careers";
import { householdStore } from "../session/store";
import { pairKey, type HouseholdState } from "../session/types";
import { activeGoalLabel, waitingForStation } from "../sim/simulate";
import { LIFESTYLES, scheduleLabel, SHIFT_SECONDS, canChangeLifestyle, yieldShiftLabel, shiftIsOpen } from "../sim/schedule";
import { FURNITURE, FURNITURE_BY_ID } from "../objects/catalog";
import { traitsOf } from "../traits";
import { nextBill, RATION_BUNDLE, RELIEF, PANTRY_CAP } from "../sim/economy";
import { HULL_PATCH_COST, repairCost } from "../sim/events";
import { ENAMEL, Fine, Heading, Icon, INK, Meter, MOOD_COLORS, NEED_COLORS, NEED_ICON, Plate, Row, Swatch, Tag, Text, WARN, creditsText } from "./kit";

type Command = (name: string, data?: Record<string, unknown>) => unknown;
const CARE = [{ goal: "hunger", label: "Nourish", detail: "Uses 1 ration" }, { goal: "energy", label: "Rest", detail: "Lowers stress" }, { goal: "fun", label: "Play", detail: "Lowers stress" }] as const;

function Section({ title }: { title: string }) { return <Heading size={16} padding={[8, 0, 0, 0]}>{title}</Heading>; }

/** Everything the care card prints for one being, as plain values: the card redraws only when one of them changes. */
function inspectorView(household: HouseholdState, objects: readonly SceneObject[], now: number) {
  const id = household.selectedMemberId;
  const member = id ? household.members[id] : null;
  if (!member || !id) return null;
  const view = careerView(household);
  const progress = rungProgressIn(view, member);
  const yieldPay = stationPayIn(view, member, "yield");
  const bloomPay = stationPayIn(view, member, "bloom");
  const crop = member.bloomCrop ?? "pantry";
  const reward = bloomHarvestIn(view, member, crop, false);
  const hasPaidStation = objects.some(object => member.lifestyle === "bloom" ? object.catalogId === "bloom_planter" : FURNITURE_BY_ID[object.catalogId]?.role === "work");
  const book = householdBook(household);
  const company = member.action.kind === "wander" && member.action.company !== undefined ? household.members[member.action.company]?.name : undefined;
  const mood = moodOfNeeds(member.needs);
  return {
    id, name: member.name, job: member.job, plan: member.bodyPlan, lifestyle: member.lifestyle,
    mood: { tier: mood.tier, face: mood.face, label: mood.label },
    goal: activeGoalLabel(member, company),
    traits: traitsOf(member).map(trait => ({ id: trait.id, label: trait.label, blurb: trait.blurb })),
    feverHours: (member.illUntil ?? 0) > now ? Math.ceil(((member.illUntil ?? 0) - now) / 210 * 24) : null,
    recovering: member.recovering,
    progressLine: `${progress.career.label} · ${RUNG_NAMES[progress.rung - 1]} (rung ${progress.rung}/3) · household standing ${progress.have}`,
    payLine: `Yield ${yieldPay.masteryLabel} · pay x${yieldPay.factor.toFixed(2)} on a console. Bloom ${bloomPay.masteryLabel} · pay x${bloomPay.factor.toFixed(2)} on a planter${bloomPay.rations > 0 ? `, +${bloomPay.rations} ration${bloomPay.rations === 1 ? "" : "s"}` : ""}.`,
    posts: postRows(household, member).map(row => ({
      id: row.career.id, label: row.career.label, current: row.current, open: row.open,
      note: row.current ? `${STATION_NAME[row.career.station === "either" ? (member.lifestyle === "bloom" ? "bloom" : "yield") : row.career.station]} post` : row.open ? `${row.career.station === "either" ? "either station" : `${STATION_NAME[row.career.station]} family`}` : `${row.needs} standing`,
    })),
    canPromote: progress.canPromote,
    promoteLabel: progress.canPromote ? `Promote to ${progress.career.label} ${progress.nextLabel} · pay x${(progress.nextRung === 3 ? progress.career.native[2] : progress.career.native[1]).toFixed(2)}` : progress.reason,
    concern: member.concern,
    care: CARE.map(action => {
      const available = objects.some(object => FURNITURE_BY_ID[object.catalogId]?.role === action.goal && (action.goal !== "fun" || object.catalogId !== "bloom_planter"));
      const empty = action.goal === "hunger" && household.pantry === 0;
      return { goal: action.goal, label: action.label, disabled: !available || empty, reason: !available ? "Add a station" : empty ? "Pantry empty" : action.detail };
    }),
    rhythm: `${scheduleLabel(member)} · ${member.completedShifts} completed / ${member.missedShifts} missed shifts`,
    canChange: canChangeLifestyle(member),
    crop,
    cropLocked: member.shiftProgress > 0 || member.harvestToday > 0,
    crops: (["pantry", "export"] as const).map(choice => ({ choice, output: bloomHarvestIn(view, member, choice, false) })),
    paidReason: !hasPaidStation ? `Add a ${member.lifestyle === "bloom" ? "Bloom Planter" : "Yield Console"} with Furnish` : member.recovering ? "Recover before paid work" : member.shiftDay === household.day ? "Today's paid shift is finished or missed" : !shiftIsOpen(member, now) ? `Paid window: ${scheduleLabel(member)}` : null,
    shiftLabel: yieldShiftLabel(member, waitingForStation(household, member, objects)),
    reward,
    yieldValue: yieldShiftValue(household, member),
    harvestToday: member.harvestToday,
    bonds: household.order.filter(other => other !== id).map(other => ({ id: other, name: household.members[other]?.name ?? "?", value: household.relationships[pairKey(id, other)] ?? 0 })).sort((a, b) => b.value - a.value).map(bond => ({ id: bond.id, name: bond.name, value: Math.round(bond.value), word: bondWord(book, id, bond.id) })),
  };
}

/** A being's care card: mood, traits, needs, post and mastery, direct care, rhythm, shift and bonds. */
export function Inspector() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const objects = useSceneObjects();
  const card = useGameStore((c) => inspectorView(householdStore.read(c), objects, c.time.now()));
  if (card === null) return null;
  const { id, crop, reward, paidReason, shiftLabel } = card;
  const member = () => householdStore.read(ctx).members[id];
  const shiftSeconds = () => { const m = member(); return m === undefined ? 0 : m.lifestyle === "yield" ? m.workToday : m.shiftProgress; };
  const run = (name: string, input: Record<string, unknown>) => () => commands.run(name, input);
  return <>
    <Row gap={10}><Swatch plan={card.plan} size={52} /><RuneView grow={1} gap={2}><Heading>{card.name}</Heading><Fine>{card.job}</Fine></RuneView>
      <Plate tone="cream" radius={99} minHeight={34} padding={[4, 10, 4, 10]} label="Close member care" onPress={run("member.select", { id: null })}><Icon name="cross" size={14} /></Plate></Row>
    <Row gap={6}><Text weight={700} color={MOOD_COLORS[card.mood.tier] ?? INK}>{`${card.mood.face} ${card.mood.label}`}</Text><Fine grow={1} shrink>{card.goal}</Fine></Row>
    <Row gap={5} label="Traits">{card.traits.map(trait => <RuneView key={trait.id} fill={ENAMEL.lilac} radius={99} border={{ width: 1.5, color: INK }} padding={[2, 10, 2, 10]} tooltip={trait.blurb}><Text size={13} weight={700}>{trait.label}</Text></RuneView>)}</Row>
    <Fine>{card.traits.map(trait => trait.blurb).join(" ")}</Fine>
    {card.feverHours !== null ? <Text color={WARN}>{`Fever: no paid work and rest drains faster for another ${card.feverHours} hours.`}</Text> : null}
    <Row gap={8}><Text size={13} width={110}>{card.recovering ? "Burnout recovery" : "Stress"}</Text><Meter label="Stress" value={() => member()?.stress ?? 0} color="#ff9e8c" width={150} /><Text size={13} weight={700} text={bind(() => String(Math.round(member()?.stress ?? 0)))} /></Row>
    {card.recovering ? <Text color={WARN}>Paid work stops during recovery. Reach 50 Nourish and Rest, then reduce stress below 35.</Text> : null}
    {NEEDS.map(need => <Row key={need} gap={8}><Icon name={NEED_ICON[need]} size={14} color={NEED_COLORS[need]} /><Text size={13} width={90}>{NEED_DEFS[need].label}</Text>
      <Meter label={NEED_DEFS[need].label} value={() => member()?.needs[need] ?? 0} color={bind(() => (member()?.needs[need] ?? 0) < 30 ? "#ff6b7d" : NEED_COLORS[need])} width={150} />
      <Text size={13} weight={700} text={bind(() => String(Math.round(Math.max(0, Math.min(100, member()?.needs[need] ?? 0)))))} /></Row>)}
    <Section title="Post & mastery" />
    <Fine>{card.progressLine}</Fine>
    <Fine>{card.payLine}</Fine>
    <RuneView layout="grid" columns={2} gap={6} label="Posts">{card.posts.map(row => <Plate key={row.id} on={row.current} disabled={row.current || !row.open} layout="stack" gap={1} items="start" onPress={run("member.career", { id, career: row.id })}><Text weight={700} size={14}>{row.label}</Text><Fine size={12}>{row.note}</Fine></Plate>)}</RuneView>
    <Plate tone="butter" disabled={!card.canPromote} onPress={run("member.promote", { id })}>{card.promoteLabel}</Plate>
    {card.concern ? <Text role="status" color={WARN}>{card.concern}</Text> : null}
    <Fine>A shift raises mastery and household standing. Rungs cost standing, never credits; a Bloom Master adds a ration to every harvest.</Fine>
    <Section title="Care now" />
    <RuneView layout="grid" columns={3} gap={6} label="Direct care">{card.care.map(action => <Plate key={action.goal} tone="mint" disabled={action.disabled} layout="stack" gap={1} items="start" onPress={run("member.direct", { id, goal: action.goal === "fun" ? "play" : action.goal })}><Text weight={700} size={14}>{action.label}</Text><Fine size={11}>{action.reason}</Fine></Plate>)}</RuneView>
    <Section title="Daily rhythm" />
    <Fine>{card.rhythm}</Fine>
    <RuneView gap={6} label="Daily schedule">{LIFESTYLES.map(lifestyle => <Plate key={lifestyle.id} on={card.lifestyle === lifestyle.id} disabled={card.lifestyle !== lifestyle.id && !card.canChange} layout="stack" gap={1} items="start" onPress={run("member.lifestyle", { id, lifestyle: lifestyle.id })}><Text weight={700} size={14}>{lifestyle.label}</Text><Fine size={12}>{lifestyle.blurb}</Fine></Plate>)}</RuneView>
    {card.canChange ? null : <Fine>Today’s paid shift is committed. Change rhythm tomorrow.</Fine>}
    {card.lifestyle === "bloom" ? <>
      <Section title="Choose today's crop" />
      <RuneView layout="grid" columns={2} gap={6} label="Bloom crop">{card.crops.map(({ choice, output }) => <Plate key={choice} on={crop === choice} disabled={card.cropLocked && crop !== choice} layout="stack" gap={1} items="start" onPress={run("member.bloomCrop", { id, crop: choice })}><Text weight={700} size={14}>{choice === "pantry" ? "Pantry crop" : "Export crop"}</Text><Fine size={12}>{`${output.rations} rations · ${output.credits} credits`}</Fine></Plate>)}</RuneView>
      <Fine>{`Export trades 3 rations for 12 extra credits. Friends tending nearby add 1 ration and 12 credits. ${card.cropLocked ? "Crop committed until tomorrow." : "Choose before tending starts."}`}</Fine>
    </> : null}
    <Plate tone="pink" disabled={paidReason !== null || shiftLabel !== null} onPress={run("member.direct", { id, goal: card.lifestyle === "bloom" ? "tend" : "work" })}>{shiftLabel ?? (card.lifestyle === "bloom" ? `Tend ${crop} crop · ${reward.rations} rations + ${reward.credits} credits` : `Start Yield shift · earn up to ${card.yieldValue} credits`)}</Plate>
    <Fine>{paidReason ?? (shiftLabel !== null ? "Shift under way. Care needs can interrupt it." : "20 seconds at the station. Care needs can interrupt your shift.")}</Fine>
    <Row gap={8} label="Shift progress"><Text size={13} width={110}>Shift progress</Text><Meter value={() => (shiftSeconds() / SHIFT_SECONDS) * 100} color="#8fdcb8" width={150} /><Text size={13} weight={700} text={bind(() => `${Math.round(shiftSeconds())} / ${SHIFT_SECONDS}s`)} /></Row>
    <Fine text={bind(() => `Today: ${(member()?.workToday ?? 0).toFixed(0)} seconds worked · ${card.harvestToday} rations grown`)} />
    <Plate onPress={run("member.release", { id })}>{`Release direction · let ${card.name.split(" ")[0]} choose`}</Plate>
    <Section title="Relationships" />
    <Fine>Conversations ease stress. Two stressed beings may dispute instead.</Fine>
    {card.bonds.map(bond => <Row key={bond.id} gap={8}><RuneView grow={1} gap={0}><Text weight={700} size={14}>{bond.name}</Text><Fine size={12}>{`${bond.word} · ${bond.value}`}</Fine></RuneView><Plate tone="sky" label={`Talk with ${bond.name}`} onPress={run("member.socialize", { id, withId: bond.id })}>Talk</Plate></Row>)}
    <Fine>Select a furnishing in the habitat to direct this being. A Bond Ring used alone can only restore Social to 55.</Fine>
  </>;
}

/** The furnishings catalogue: pick one, then tap open floor; placed pieces can be sold back. */
export function BuildPalette({ onChoose }: { onChoose: () => void }) {
  const ctx = useGameContext();
  const { commands } = useGame();
  const buildTool = useStore(householdStore, (s) => s.buildTool);
  const placed = useSceneObjects().filter(object => FURNITURE_BY_ID[object.catalogId]);
  const [managing, setManaging] = useState(false);
  const credits = () => householdStore.read(ctx).credits;
  return <>
    <Heading size={18}>Make room for life</Heading>
    <Fine>Pick one, then tap open floor. Each piece adds to the nightly bill.</Fine>
    <RuneView layout="grid" columns={2} responsive={{ phone: { columns: 1 } }} gap={8}>
      {FURNITURE.map((def) => <Plate key={def.id} on={buildTool === def.id} disabled={bind(() => credits() < def.cost)} opacity={bind(() => credits() < def.cost ? 0.5 : 1)} layout="stack" gap={3} items="start" justify="start" label={def.name}
        onPress={() => { commands.run("build.tool", { toolId: def.id }); onChoose(); }}>
        <Row gap={6}><Icon name={def.role === "work" ? "gear" : NEED_ICON[def.role]} size={22} color={def.color} /><Text weight={700}>{def.name}</Text></Row>
        <Fine size={12}>{def.blurb}</Fine>
        <Text weight={700} size={14}>{`${def.cost} credits`}</Text>
        <Fine size={11} color={WARN} text={bind(() => credits() < def.cost ? `Need ${creditsText(def.cost - credits())} more credits` : "")} />
      </Plate>)}
    </RuneView>
    {buildTool ? <Row gap={8} role="status"><Text grow={1} shrink>{`Place ${FURNITURE_BY_ID[buildTool]?.name} · cost ${FURNITURE_BY_ID[buildTool]?.cost} credits`}</Text><Plate tone="coral" onPress={() => commands.run("build.cancel", {})}>Cancel placement</Plate></Row> : null}
    <Plate tone="cream" onPress={() => setManaging(!managing)}>{`${managing ? "Hide" : "Manage"} placed furnishings · ${placed.length}`}</Plate>
    {managing ? placed.map(object => <Row key={object.instanceId} gap={8}><Text grow={1}>{FURNITURE_BY_ID[object.catalogId]!.name}</Text><Plate tone="butter" onPress={() => commands.run("object.sell", { id: object.instanceId })}>{`Sell · ${Math.round(FURNITURE_BY_ID[object.catalogId]!.cost / 2)} credits`}</Plate></Row>) : null}
  </>;
}

function Line({ label, value }: { label: string; value: Live<string> }) {
  return <Row justify="between"><Text size={14}>{label}</Text><Text size={14} weight={700} text={value} /></Row>;
}

/** The pantry and bills drawer: today's books, rations and repairs, with the ticking credits written live. */
export function PantryLedger({ command }: { command: Command }) {
  const ctx = useGameContext();
  const objects = useSceneObjects();
  const ledger = useStore(householdStore, (state) => ({
    dayHarvest: state.dayHarvest, bill: Math.round(nextBill(state, objects)), credits: Math.floor(state.credits), debt: state.debt,
    lastDay: state.lastDay === null ? null : { ...state.lastDay }, pantry: state.pantry, reliefDay: state.reliefDay, day: state.day,
    canBuy: state.credits >= RATION_BUNDLE.cost && state.pantry + RATION_BUNDLE.quantity <= PANTRY_CAP,
    canRelief: state.reliefDay !== state.day && state.pantry < 4 && state.credits < RATION_BUNDLE.cost,
    broken: (state.hazards?.broken ?? []).flatMap((id) => { const obj = objects.find((o) => o.instanceId === id); return obj === undefined ? [] : [{ id, catalogId: obj.catalogId, affordable: state.credits >= repairCost(obj.catalogId) }]; }),
    hullLeak: state.hazards?.hullLeak === true, canPatch: state.credits >= HULL_PATCH_COST,
  }));
  const { canBuy, canRelief } = ledger;
  return <>
    <RuneView gap={4} padding={[4, 0, 4, 0]}>
      <Line label="Earned today" value={bind(() => creditsText(householdStore.read(ctx).dayIncome))} />
      <Line label="Grown today" value={`${ledger.dayHarvest} rations`} />
      <Line label="Due at midnight" value={String(ledger.bill)} />
      <Line label="In the jar" value={creditsText(ledger.credits)} />
      {ledger.debt > 0 ? <Row justify="between"><Text size={14} color={WARN}>Debt carried</Text><Text size={14} weight={700} color={WARN}>{creditsText(ledger.debt)}</Text></Row> : null}
    </RuneView>
    {ledger.lastDay ? <Fine>{`Yesterday: ${creditsText(ledger.lastDay.income)} earned, ${ledger.lastDay.harvest} rations grown, ${ledger.lastDay.bill} billed, ${ledger.lastDay.missed} shifts missed.`}</Fine> : null}
    <Plate tone="mint" disabled={!canBuy} onPress={() => command("household.rations")}>{`Buy ${RATION_BUNDLE.quantity} rations · ${RATION_BUNDLE.cost} credits`}</Plate>
    <Fine text={canBuy ? "Each meal uses one ration." : ledger.pantry + RATION_BUNDLE.quantity > PANTRY_CAP ? "The pantry has no room for six more." : bind(() => `Need ${creditsText(RATION_BUNDLE.cost - householdStore.read(ctx).credits)} more credits.`)} />
    <Plate tone="coral" disabled={!canRelief} onPress={() => command("household.relief")}>{`Emergency ${RELIEF.quantity} rations · +${RELIEF.debt} debt`}</Plate>
    <Fine>{canRelief ? "Once a day. The next bill repays up to 40." : ledger.reliefDay === ledger.day ? "Relief already taken today." : "Only when under 4 rations and 36 credits."}</Fine>
    {ledger.broken.length > 0 || ledger.hullLeak ? <>
      <Section title="Repairs" />
      {ledger.broken.map(({ id, catalogId, affordable }) => <Plate key={id} tone="butter" disabled={!affordable} onPress={() => command("household.repair", { id })}>{`Mend the ${FURNITURE_BY_ID[catalogId]?.name ?? "furnishing"} · ${repairCost(catalogId)} credits`}</Plate>)}
      {ledger.hullLeak ? <Plate tone="butter" disabled={!ledger.canPatch} onPress={() => command("household.patchHull")}>{`Patch the torpor wing · ${HULL_PATCH_COST} credits`}</Plate> : null}
      <Fine>Broken furnishings stand idle and an inspector fines a habitat in disrepair.</Fine>
    </> : null}
    <Tag padding={[6, 0, 0, 0]}>{`PANTRY ${ledger.pantry} / ${PANTRY_CAP}`}</Tag>
  </>;
}
