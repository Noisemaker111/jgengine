/** @jsxImportSource @jgengine/core/ui/jsx */
import { useState } from "@jgengine/core/ui/jsx";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { bind } from "@jgengine/core/ui/rune/primitives";
import { useGame } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import { useStore } from "@jgengine/ui/store";

import {
  boardingOf, deedPaid, houseView, moduleBlocker, nextModulePrice, noVacancy, roomBySlot, roomOf, speciesOfMember, tenantComfort,
  tuneCost, vacantRooms,
} from "../boarding/boarding";
import {
  comfortWord, effectiveRoom, noiseWord, ROOM_COLUMNS, ROOM_FACTORS, ROOM_SLOTS, SEAL_COST, SETTING_COST, SHUTTER_COST, type RoomFactor,
} from "../boarding/rooms";
import { ATMOSPHERES, CLIMATES, GRAVITIES, INTERVIEW_QUESTIONS, LIGHTS, SPECIES } from "../boarding/species";
import { householdStore } from "../session/store";
import type { HouseholdState } from "../session/types";
import { ENAMEL, Fine, Heading, Icon, INK, Paper, Plate, RIM, Row, Swatch, Tag, Text, WARN, creditsText } from "./kit";

const FACTOR_LABEL: Record<RoomFactor, string> = { atmosphere: "Air", gravity: "Gravity", climate: "Warmth", light: "Light" };
const FACTOR_VALUES: Record<RoomFactor, readonly string[]> = { atmosphere: ATMOSPHERES, gravity: GRAVITIES, climate: CLIMATES, light: LIGHTS };
const VALUE_LABEL: Record<string, string> = {
  oxygen: "O₂", methane: "CH₄", vacuum: "Vacuum", low: "Low", standard: "Standard", heavy: "Heavy",
  cold: "Cold", temperate: "Mild", hot: "Hot", dark: "Dark", dim: "Dim", bright: "Bright",
};
const AIR_TINT: Record<"oxygen" | "methane" | "vacuum", string> = { oxygen: "#cff3e2", methane: "#e6f5a8", vacuum: "#dcd2ff" };

export function comfortTint(score: number): string {
  return score >= 80 ? "#9ff0c4" : score >= 55 ? "#dff59a" : score >= 30 ? "#ffd98a" : "#ff9e8c";
}

/** Everything the rooms plan prints, as plain values so it redraws only when the house changes. */
function plan(state: HouseholdState, now: number) {
  const boarding = boardingOf(state);
  const house = houseView(state, now);
  const cells = Array.from({ length: ROOM_SLOTS }, (_, slot) => {
    const room = roomBySlot(state, slot);
    if (room === null) return { slot, built: false as const, blocked: moduleBlocker(state, slot) };
    const tenant = room.tenantId === null ? null : state.members[room.tenantId] ?? null;
    const comfort = tenant === null ? null : tenantComfort(state, tenant.id, now);
    const eff = effectiveRoom(house, room);
    return {
      slot, built: true as const, settings: { ...room.settings }, sealed: room.sealed, shuttered: room.shuttered,
      tenant: tenant === null ? null : { id: tenant.id, name: tenant.name, plan: tenant.bodyPlan, species: speciesOfMember(tenant) },
      comfort: comfort === null ? null : { score: Math.round(comfort.score), second: comfort.second === undefined ? null : Math.round(comfort.second), reasons: comfort.reasons.map((r) => ({ factor: r.factor, penalty: r.penalty, text: r.text })) },
      noise: eff.noise, leakIn: [...eff.leakIn], effective: { ...eff.settings }, tune: tuneCost(state, slot),
    };
  });
  const fixtures = state.order.filter((id) => roomOf(state, id) === null).map((id) => ({ id, name: state.members[id]!.name, plan: state.members[id]!.bodyPlan }));
  return {
    cells, fixtures, reputation: Math.round(boarding.reputation), full: noVacancy(state), credits: Math.floor(state.credits),
    next: nextModulePrice(state), deed: Math.round(boarding.deedOwed), deedPaid: deedPaid(state),
    tenants: state.order.map((id) => ({ id, name: state.members[id]!.name, slot: roomOf(state, id)?.slot ?? null })),
    reviews: boarding.reviews.map((r) => ({ ...r })),
  };
}

/** The rooms plan: two rows of berths as a blueprint, the chosen room's card, the reviews and the deed. */
export function RoomsPanel() {
  const ctx = useGameContext();
  const { commands } = useGame();
  const view = useStore(householdStore, (s) => plan(s, ctx.time.now()));
  const [chosen, setChosen] = useState<number>(0);
  const run = (name: string, input: Record<string, unknown>) => () => commands.run(name, input);
  const cell = view.cells[chosen]!;
  const rows = [[4, 5, 6, 7], [0, 1, 2, 3]];
  return <>
    <Row gap={6} justify="between">
      <Text weight={700} size={14}>{`Reputation ${view.reputation} / 100`}</Text>
      <RuneView fill={view.full ? "#ff5fa8" : "#6ff3ff"} radius={6} padding={[2, 8, 2, 8]} border={{ width: 2, color: RIM }}><Text size={12} weight={700} color={INK}>{view.full ? "NO VACANCY" : "VACANCY"}</Text></RuneView>
    </Row>
    <Fine>Back row on top, corridor row below. Walls leak air and noise into the room next door unless sealed.</Fine>
    <RuneView gap={5} label="Room plan">
      {rows.map((row) => <RuneView key={row[0]} layout="grid" columns={ROOM_COLUMNS} gap={5}>
        {row.map((slot) => {
          const c = view.cells[slot]!;
          const on = slot === chosen;
          if (!c.built) return <Plate key={slot} on={on} tint="#3a3150" minHeight={78} layout="stack" gap={2} items="center" justify="center" padding={[4, 4, 4, 4]} label={`Berth ${slot + 1} for sale`} onPress={() => setChosen(slot)}>
            <Text size={12} weight={700} color="#e6dcff">{`Berth ${slot + 1}`}</Text><Fine size={11} color="#c9b6ff">for sale</Fine>
          </Plate>;
          return <Plate key={slot} on={on} tint={c.comfort === null ? AIR_TINT[c.settings.atmosphere] : comfortTint(c.comfort.score)} minHeight={78} layout="stack" gap={1} items="center" justify="center" padding={[4, 4, 4, 4]}
            label={`Room ${slot + 1}${c.tenant ? ` · ${c.tenant.name}` : " · empty"}`} onPress={() => setChosen(slot)}>
            <Tag color={INK}>{`ROOM ${slot + 1}`}</Tag>
            {c.tenant ? <Swatch plan={c.tenant.plan} size={30} /> : <Fine size={11}>empty</Fine>}
            <Fine size={10} color={INK}>{`${VALUE_LABEL[c.settings.atmosphere]} · ${VALUE_LABEL[c.settings.gravity]}`}</Fine>
          </Plate>;
        })}
      </RuneView>)}
    </RuneView>
    {view.fixtures.length > 0 ? <Row gap={6} padding={[2, 0, 2, 0]}>{view.fixtures.map((f) => <Row key={f.id} gap={4}><Swatch plan={f.plan} size={24} /><Fine size={12} color={WARN}>{`${f.name} has no room — in the broom cupboard`}</Fine></Row>)}</Row> : null}
    {cell.built ? <RoomCard cell={cell} view={view} run={run} /> : <RuneView gap={6}>
      <Heading size={17}>{`Berth ${chosen + 1}: open dock`}</Heading>
      <Fine>{`The next module costs ${view.next.price} credits and the station wants ${view.next.reputation} reputation first. Each module adds a nightly docking draw.`}</Fine>
      <Plate tone="butter" disabled={cell.blocked !== null} onPress={run("room.buy", { slot: chosen })}><Icon name="hammer" size={16} /><Text weight={700}>{`Dock a module · ${view.next.price} credits`}</Text></Plate>
      {cell.blocked !== null ? <Fine color={WARN}>{cell.blocked}</Fine> : null}
    </RuneView>}
    <Heading size={16} padding={[8, 0, 0, 0]}>Latest reviews</Heading>
    {view.reviews.length === 0 ? <Fine>No reviews yet. Tenants write them on rent night.</Fine> : view.reviews.map((r, i) => <RuneView key={`${r.day}-${r.tenantId}-${i}`} gap={0}>
      <Row gap={4}><Text size={13} weight={700}>{r.name}</Text><Text size={13} color="#c2477f">{"★".repeat(r.stars) + "☆".repeat(5 - r.stars)}</Text></Row>
      <Fine size={12}>{`“${r.text}”`}</Fine>
    </RuneView>)}
    <Heading size={16} padding={[8, 0, 0, 0]}>The station section</Heading>
    {view.deedPaid
      ? <Text>The section is yours outright. No docking fee is ever charged again.</Text>
      : <>
        <Fine>{`The deed to this slice of the station: ${creditsText(view.deed)} credits still owed. Pay it off and the nightly docking fee stops for good.`}</Fine>
        <Row gap={6}>
          <Plate tone="mint" disabled={view.credits < 100} onPress={run("deed.pay", { amount: 100 })}>Pay 100</Plate>
          <Plate tone="mint" disabled={view.credits < 500} onPress={run("deed.pay", { amount: 500 })}>Pay 500</Plate>
          <Plate tone="pink" disabled={view.credits < view.deed} onPress={run("deed.pay", { amount: view.deed })}>Pay it off</Plate>
        </Row>
      </>}
  </>;
}

type Plan = ReturnType<typeof plan>;
type BuiltCell = Extract<Plan["cells"][number], { built: true }>;

function RoomCard({ cell, view, run }: { cell: BuiltCell; view: Plan; run: (name: string, input: Record<string, unknown>) => () => unknown }) {
  const slot = cell.slot;
  const tenant = cell.tenant;
  const speciesDef = tenant === null ? null : SPECIES[tenant.species];
  const comfort = cell.comfort;
  return <RuneView gap={6}>
    <Row gap={8}>
      {tenant ? <Swatch plan={tenant.plan} size={44} /> : null}
      <RuneView grow={1} shrink gap={0}>
        <Heading size={17}>{tenant ? `Room ${slot + 1} · ${tenant.name}` : `Room ${slot + 1} · empty`}</Heading>
        <Fine size={12}>{speciesDef ? speciesDef.title : "Waiting for a tenant. Applicants buzz at the airlock while a room stands empty."}</Fine>
      </RuneView>
    </Row>
    {comfort !== null ? <RuneView fill={comfortTint(comfort.score)} radius={10} border={{ width: 2, color: RIM }} padding={[6, 10, 6, 10]} gap={2}>
      <Text weight={700}>{`${comfortWord(comfort.score)} · comfort ${comfort.score}${comfort.second !== null ? ` / other head ${comfort.second}` : ""}`}</Text>
      <Fine size={12} color={INK}>{`“${comfort.reasons[0]?.text || speciesDef!.lines.happy[0]}”`}</Fine>
    </RuneView> : null}
    {comfort !== null && comfort.reasons.length > 0 ? <RuneView gap={2} label="What is wrong">{comfort.reasons.map((r) => <Row key={r.factor} gap={6}>
      <Text size={12} weight={700} color={WARN} width={36}>{`-${r.penalty}`}</Text><Fine size={12} grow={1} shrink>{r.factor === "leak" ? "Air leaking in through a shared wall" : r.factor === "noise" ? "Too loud for them" : `${FACTOR_LABEL[r.factor as RoomFactor]} is not to their taste`}</Fine>
    </Row>)}</RuneView> : null}
    <Fine size={12}>{`Tonight it is ${noiseWord(cell.noise)}${cell.leakIn.length > 0 ? `, with ${cell.leakIn.map((a) => VALUE_LABEL[a]).join(" and ")} seeping in` : ""}${cell.effective.climate !== cell.settings.climate ? `, and feels ${VALUE_LABEL[cell.effective.climate]!.toLowerCase()} from next door` : ""}.`}</Fine>
    {ROOM_FACTORS.map((factor) => <RuneView key={factor} gap={3}>
      <Tag>{`${FACTOR_LABEL[factor].toUpperCase()} · ${SETTING_COST[factor]} CR TO CHANGE`}</Tag>
      <Row gap={4} label={FACTOR_LABEL[factor]}>{FACTOR_VALUES[factor].map((value) => <Plate key={value} tone={cell.settings[factor] === value ? "pink" : "cream"} on={cell.settings[factor] === value} minHeight={30} padding={[3, 9, 3, 9]} size={13}
        disabled={cell.settings[factor] !== value && view.credits < SETTING_COST[factor]} onPress={run("room.set", { slot, factor, value })}>{VALUE_LABEL[value] ?? value}</Plate>)}</Row>
    </RuneView>)}
    {tenant ? <Plate tone="mint" disabled={cell.tune === 0 || view.credits < cell.tune} onPress={run("room.tune", { slot })}>{cell.tune === 0 ? `Already to ${tenant.name}'s taste` : `Tune to ${tenant.name}'s taste · ${cell.tune} credits`}</Plate> : null}
    <Row gap={6}>
      <Plate tone="sky" disabled={cell.sealed || view.credits < SEAL_COST} onPress={run("room.seal", { slot })}>{cell.sealed ? "Sealed" : `Seal walls · ${SEAL_COST}`}</Plate>
      <Plate tone="lilac" disabled={cell.shuttered || view.credits < SHUTTER_COST} onPress={run("room.shutter", { slot })}>{cell.shuttered ? "Shuttered" : `Flare shutters · ${SHUTTER_COST}`}</Plate>
    </Row>
    <Tag>MOVE SOMEONE IN · THEY SWAP ROOMS</Tag>
    <RuneView layout="grid" columns={2} gap={5} label="Move a tenant here">{view.tenants.filter((t) => t.slot !== slot).map((t) => <Plate key={t.id} minHeight={32} padding={[3, 8, 3, 8]} size={13}
      disabled={tenant !== null && t.slot === null} onPress={run("room.move", { id: t.id, slot })}>{t.slot === null ? `${t.name} (cupboard)` : `${t.name} (room ${t.slot + 1})`}</Plate>)}</RuneView>
  </RuneView>;
}

/** The airlock buzzer: who is outside, three questions, and the choice to let them in. */
export function ApplicantSlip({ width }: { width: number }) {
  const ctx = useGameContext();
  const { commands } = useGame();
  const slip = useStore(householdStore, (s) => {
    const applicant = boardingOf(s).applicant;
    if (applicant === null) return null;
    const def = SPECIES[applicant.species];
    const vacant = vacantRooms(s)[0] ?? null;
    return { species: applicant.species, name: def.name, title: def.title, plan: def.bodyPlan, asked: [...applicant.asked], deadline: applicant.deadline, vacant: vacant?.slot ?? null, rent: def.upfront !== undefined ? `pays ${def.upfront} up front, then nothing for a century` : `${def.rent * def.checks} credits a night at full comfort` };
  });
  if (slip === null) return null;
  const def = SPECIES[slip.species];
  return <Paper width={width} padding={[14, 16, 16, 16]} gap={8} role="alertdialog" label={`Applicant: ${slip.name}`}>
    <Row gap={10}><Swatch plan={slip.plan} size={44} />
      <RuneView gap={0} grow={1} shrink><Tag>BUZZ AT THE AIRLOCK</Tag><Heading size={19}>{slip.name}</Heading><Fine size={12}>{slip.title}</Fine></RuneView></Row>
    <Text size={14}>{`“${def.lines.greet}”`}</Text>
    {INTERVIEW_QUESTIONS.map((q, i) => slip.asked.includes(i)
      ? <RuneView key={q} fill={ENAMEL.cream} radius={10} border={{ width: 1.5, color: RIM }} padding={[5, 9, 5, 9]} gap={1}><Fine size={12}>{q}</Fine><Text size={13}>{def.lines.interview[i]}</Text></RuneView>
      : <Plate key={q} tone="sky" minHeight={32} padding={[4, 10, 4, 10]} size={13} onPress={() => commands.run("applicant.ask", { question: i })}>{`Ask: ${q}`}</Plate>)}
    <Fine>{`Rent: ${slip.rent}.`}</Fine>
    <Row gap={6}>
      <Plate tone="mint" disabled={slip.vacant === null} onPress={() => commands.run("applicant.accept", { slot: slip.vacant })}><Icon name="key" size={16} /><Text weight={700}>{slip.vacant === null ? "No room free" : `Let them in · room ${slip.vacant + 1}`}</Text></Plate>
      <Plate tone="coral" onPress={() => commands.run("applicant.reject", {})}>Turn away</Plate>
    </Row>
    <Fine text={bind(() => `They will wait ${Math.max(0, Math.ceil(slip.deadline - ctx.time.now()))} more seconds.`)} />
  </Paper>;
}
