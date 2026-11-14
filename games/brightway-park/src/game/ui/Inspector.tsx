/** @jsxImportSource @jgengine/core/ui/jsx */
import { useGame, useGameStore } from "@jgengine/ui/hooks";
import { useGameContext } from "@jgengine/ui/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { RuneView } from "@jgengine/core/ui/rune/primitives.view";
import { upgradeOptions } from "@jgengine/core/worldModel/upgradePaths";

import { session } from "../session";
import { liveAgent } from "../agents";
import { FIT_KINDS, guestRidePreference, rideFit, rideThrill } from "../sim/rideExperience";
import { visitorKind } from "../entities/guests/catalog";
import { liveChain, chainMultiplier } from "../scares";
import { ghostStatuses } from "../ghosts";
import { ecto } from "../ecto";
import { coasterCircuit, rideView, trackPieces } from "../rides";
import { parkDuration } from "../books";
import { fairPrice, park, parkObject, patrolRadius, PATROL, reliability, repairAction, ridePrice, stallPrice, stockOf } from "../park";
import { accessOf, connectCost } from "../build/links";
import { refundOf } from "../parkScene";
import { isShut, refitLadder, refitOf, REFITS, reopenAction, rideUpkeep, shutAction, SHUT_UPKEEP } from "../rideRefits";
import { BAD, Button, GOOD, INK, Meter, PENCIL, Row, Rows, Stepper, Text, WARN, Window } from "./look";

const PHASE_LABEL: Record<string, string> = { idle: "Waiting", loading: "Boarding", riding: "Scaring", unloading: "Letting off", broken: "Seized up" };

/** What a visitor is doing, read from its own phase/target - the "thought" the window shows. */
function activity(name: string | null, phase: string, fled: boolean): string {
  if (phase === "leaving") return fled ? "Fleeing, screaming" : "Walking out";
  if (phase === "riding") return name === null ? "On a ride" : `Riding the ${name}`;
  if (phase === "queued") return name === null ? "In line" : `Waiting in line for the ${name}`;
  if (phase === "busy") return name === null ? "Creeping round the midway" : `At the ${name}`;
  if (name !== null) return `Heading for the ${name}`;
  return "Working up the nerve for something";
}

/** A ghost resident's card: what it is, how it feels about the park, and what it wants. */
function GhostPanel({ id }: { id: string }) {
  const { commands } = useGame();
  const v = useGameStore((ctx) => {
    const status = ghostStatuses(ctx).find((entry) => `ghost:${entry.ghost.id}` === id);
    return status === undefined ? null : { label: status.ghost.label, icon: status.ghost.icon, blurb: status.ghost.blurb, state: status.state, wants: status.wants.map((want) => `${want.met ? "✓" : "○"} ${want.label}`) };
  });
  if (v === null) return null;
  return <Window eyebrow="Ghost resident" title={`${v.icon} ${v.label}`} close={() => commands.run("build.clear", {})} closeLabel="Close ghost window">
    <Text size={13} color={PENCIL}>{v.blurb}</Text>
    <Text weight={800}>{v.state}</Text>
    {v.wants.map((line) => <Text key={line} size={13}>{line}</Text>)}
  </Window>;
}

/** The visitor window: the mood the shared agent loop holds, their nerve and chain, what they are thinking, their needs, and what they are doing. */
function GuestPanel({ id }: { id: string }) {
  const ctx = useGameContext();
  const { commands } = useGame();
  const v = useGameStore(() => {
    const guest = session.guests.get(id);
    if (guest === undefined) return null;
    const agent = liveAgent(id), mood = agent?.mood();
    const need = (key: string) => `${100 - Math.round((agent?.needs.fraction(key) ?? 0) * 100)}%`;
    const card = visitorKind(guest.kind), chain = liveChain(guest, ctx.time.now());
    return {
      kind: guest.kind, mood: mood?.label ?? "", score: Math.round(mood?.score ?? 0), phase: guest.phase, target: guest.targetId, fled: guest.courage < 2,
      courage: Math.round(guest.courage), courageMax: card.courage[1],
      thoughts: (guest.thoughts ?? []).map((thought) => thought.text),
      rows: [["Scare chain", chain > 0 ? `${chain} · next scare ×${chainMultiplier(chain).toFixed(2)}` : "none"],
        ...(card.films !== undefined ? [["Footage", `${Math.round(guest.footage ?? 0)} · lost if they flee`]] as [string, string][] : []),
        ...(card.skeptic === true ? [["Skeptic", "shrugs off cheap scares"]] as [string, string][] : []),
        ["Hungry", need("hunger")], ["Thirsty", need("thirst")], ["Needs the outhouse", need("toilet")], ["Shaken", need("nausea")],
        ["Tired", need("energy")], ["Lost", need("info")], ["Stops made", String(guest.visits)]] as [string, string][],
    };
  });
  if (v === null) return null;
  return <Window eyebrow="One of the living" title={guestRidePreference(v.kind).label} close={() => commands.run("build.clear", {})} closeLabel="Close visitor window">
    <Text color={PENCIL}>{activity(parkObject(ctx, v.target)?.def.label ?? null, v.phase, v.fled)}</Text>
    <Meter label="NERVE" read={() => v.courage} max={() => v.courageMax} readout={(n) => `${n}`} color={v.courage >= 20 ? GOOD : v.courage >= 8 ? WARN : BAD} />
    <Meter label={`MOOD · ${v.mood.toUpperCase()}`} read={() => v.score} max={() => 100} readout={(n) => `${n}%`} color={v.score >= 50 ? GOOD : v.score >= 35 ? WARN : BAD} />
    {v.thoughts.length === 0 ? null : <RuneView gap={2} label="Visitor thoughts">{v.thoughts.map((text, i) => <Text key={`${i}:${text}`} size={13} weight={i === 0 ? 800 : 400} color={i === 0 ? INK : PENCIL}>{`“${text}”`}</Text>)}</RuneView>}
    <Rows rows={v.rows} />
  </Window>;
}

/**
 * One structure, as the world holds it: its facts (broken, stock sold), the crew order on it and
 * what each action would cost, with buttons that run `brightway.act` and `build.demolish`.
 */
export function Inspector() {
  const { commands } = useGame();
  const ctx = useGameContext();
  const selectedId = useGameStore(() => session.selectedObject);
  // Guests are selected through the engine's shared entity selection, which the shell draws the ring from.
  const selectedGuest = useGameStore((c) => { const [id] = c.scene.entity.selection.list(); return id !== undefined && (session.guests.has(id) || id.startsWith("ghost:")) ? id : null; });
  const v = useGameStore((c) => (selectedGuest !== null ? null : inspectorView(c, selectedId)));
  if (selectedGuest !== null) return selectedGuest.startsWith("ghost:") ? <GhostPanel id={selectedGuest} /> : <GuestPanel id={selectedGuest} />;
  if (v === null) return null;
  const obj = parkObject(ctx, v.id);
  if (obj === undefined) return null;
  const def = obj.def;
  const act = (action: string) => commands.run("brightway.act", { action, target: obj.id });
  const { broken, ordered, repair, repairCost, repairRefusal, shut, refurbishing, refitChoices, crew } = v;
  return <Window eyebrow={def.category} title={def.label} close={() => commands.run("build.clear", {})} closeLabel="Close inspector" footer={<>
    {def.ride === undefined ? null : broken && !ordered
      ? <Button tone="primary" disabled={repairRefusal !== null} tooltip={repairRefusal ?? undefined} onPress={() => { if (repair !== null) act(repair); }}>{`Send the gremlin · ${ecto(repairCost)}`}</Button>
      : <Button tone="primary" disabled={broken} onPress={() => act(`service_${obj.kind}`)}>{`Tinker · ${ecto(def.ride.breakdown.serviceCost)}`}</Button>}
    <Button tone="danger" onPress={() => commands.run("build.demolish", { id: obj.id })}>{`Tear down · +${ecto(refundOf(obj.kind))}`}</Button>
  </>}>
    <Text size={13} color={PENCIL}>{def.blurb}</Text>
    {shut !== null ? <RuneView gap={6} role="status">
      <Text weight={800} color={BAD}>{`Closed · ${shut.reason}`}</Text>
      <Button tone="primary" hint="inspector:connect" onPress={() => commands.run("build.connect", { id: obj.id })}>{`Connect it · ${ecto(shut.cost)}`}</Button>
    </RuneView> : null}
    {def.ride !== undefined ? <>
      <Stepper label={broken ? `Seized up · ${crew}` : `Scare yield · ${v.status}`} value={`${v.price}`} down={() => act(`price_down_${obj.kind}`)} up={() => act(`price_up_${obj.kind}`)} downLabel="Turn the ride down" upLabel="Turn the ride up" />
      <Row justify="between"><Text>The living brave up to</Text><Text weight={800}>{`${v.fair} nerve`}</Text></Row>
      <Row justify="between" role="status">{refurbishing
        ? <><Text grow={1} shrink>{`Resting · ${v.wearLeft}`}</Text><Button tone="primary" onPress={() => act(reopenAction(obj.kind))}>Reopen</Button></>
        : <><Text grow={1} shrink>{`Rest it at ${Math.round(SHUT_UPKEEP * 100)}% upkeep`}</Text><Button disabled={broken} tooltip={broken ? "Un-jam it first" : undefined} onPress={() => act(shutAction(obj.kind))}>Rest it</Button></>}</Row>
      {refitChoices.length === 0 ? null : <RuneView layout="grid" columns={2} gap={6}>
        {refitChoices.map((option) => <RuneView key={option.action} gap={3}>
          <Button disabled={option.refusal !== null} tooltip={option.refusal ?? undefined} onPress={() => act(option.action)}>{`${option.label} · ${ecto(option.cost)}`}</Button>
          <Text size={11} color={PENCIL}>{option.detail}</Text>
        </RuneView>)}
      </RuneView>}
      {ordered ? <Meter label="REPAIR" read={() => repairProgress(ctx, obj.id)} max={() => 1} readout={(p) => `${Math.round(p * 100)}%`} color={WARN} /> : null}
    </> : null}
    {def.stall !== undefined ? <Stepper label={`Nerve toll · the living spend up to ${v.fair}`} value={`${v.price}`} down={() => act(`price_down_${obj.kind}`)} up={() => act(`price_up_${obj.kind}`)} downLabel="Lower the toll" upLabel="Raise the toll" /> : null}
    {def.staff !== undefined ? <Stepper label="Patrol area" value={`${v.patrol} m`} down={() => act(`patrol_narrower_${obj.kind}`)} up={() => act(`patrol_wider_${obj.kind}`)} downLabel="Narrow the patrol" upLabel="Widen the patrol" downDisabled={v.patrol <= PATROL.min} upDisabled={v.patrol >= PATROL.max} /> : null}
    <Rows rows={v.rows} />
  </Window>;
}

function repairProgress(ctx: GameContext, id: string): number {
  return park.of(ctx).orders("crew").find((entry) => entry.target === id)?.progress ?? 1;
}

/** Everything {@link Inspector} prints about one structure, as plain values: the card redraws when a printed value changes, not every tick. */
function inspectorView(ctx: GameContext, selectedId: string | null) {
  const w = park.of(ctx);
  const obj = parkObject(ctx, selectedId);
  if (obj === undefined) return null;
  const def = obj.def;
  const circuit = coasterCircuit(ctx), tracks = trackPieces(ctx);
  // The ride sim's own live state: phase, line and wear.
  const view = rideView(obj.id);
  const phase = view?.phase, riders = view?.riders, queued = view?.queue.size, waitSeconds = view?.queue.wait.seconds, wear = view?.wear, breakdowns = view?.breakdowns, cycles = view?.cycles;
  const broken = w.fact(`${obj.id}.broken`) === true;
  const order = w.orders("crew").find((entry) => entry.target === obj.id) ?? null;
  const repair = def.ride === undefined ? null : repairAction(obj.kind);
  const repairCost = repair === null ? 0 : -(w.costOf(repair, obj.id)["park.cash"] ?? 0);
  const repairRefusal = repair === null ? null : w.canAct(repair, obj.id)?.message ?? null;
  const access = accessOf(ctx, obj.id);
  const shut = access !== null && !access.open ? { reason: access.reason, cost: connectCost(ctx, obj.id) } : null;
  const refurbishing = def.ride !== undefined && isShut(w, obj.id);
  const refit = def.ride === undefined ? null : refitOf(w, obj.id);
  const refitChoices = (def.ride === undefined || refit !== null ? [] : upgradeOptions(w, refitLadder(def), obj.id))
    .map((option) => ({ action: option.action, branch: option.branch ?? null, refusal: option.refusal?.message ?? null, label: option.label, cost: -(option.cost["park.cash"] ?? 0), detail: option.detail }));
  const excitement = view?.ratings.excitement ?? 0;
  const crew = order === null ? (w.num("n.staff_mechanic") < 1 ? "needs a gremlin" : "waiting for the gremlin") : order.active ? `gremlin on it · ${parkDuration(order.remaining)}` : "gremlin queued";
  const rows: [string, string][] = [
    ...(def.staff !== undefined ? [["Upkeep", `${ecto(def.upkeep)} / night`]] as [string, string][] : [
      ["Appeal", broken ? "0 while jammed" : w.num(`${obj.id}.appeal`).toFixed(1)],
      ["Upkeep", `${ecto(def.ride === undefined ? def.upkeep : rideUpkeep(w, obj.id, def))} / night`]] as [string, string][]),
    ...(def.scare !== undefined ? [["Fright", `${def.scare.fright} nerve a jolt`], ["Reach", `${def.scare.radius} m · every ${def.scare.cooldown} s`], ...(def.scare.fright < 5 ? [["Skeptics", "ignore it"]] : [])] as [string, string][] : []),
    ...(def.ride !== undefined ? [["Dread from the gloom", `+${w.num(`${obj.id}.theme`).toFixed(1)}`], ...(refit === null ? [] : [["Refit", REFITS[refit].label]])] as [string, string][] : []),
    ...(access?.open && def.ride !== undefined ? [["Queue line", access.line.length > 0 ? `${access.line.length} tiles` : "none · the living wait at the entrance"]] as [string, string][] : []),
    ...(def.ride !== undefined ? [["In line", `${queued ?? 0} · ${Math.round(Number(waitSeconds ?? 0))}s wait`], ["Seats", `${view?.capacity ?? def.ride.capacity}`], ["Reliability", `${reliability(def, Number(wear ?? 0), w.num(`${obj.id}.wear_scale`))}% · ${wear ?? 0} runs since tinkering`], ["Jams", `${breakdowns ?? 0} in ${cycles ?? 0} runs`],
      ["Fright · Thrill · Dread", `${(view?.ratings.excitement ?? def.ride.excitement).toFixed(1)} · ${rideThrill(def.id, circuit).toFixed(1)} · ${(view?.ratings.nausea ?? def.ride.nausea).toFixed(1)}`],
      ...FIT_KINDS.map((kind) => [`${guestRidePreference(kind).label} fit`, `${Math.round(rideFit(kind, def.id, circuit) * 100)}%`])] as [string, string][] : []),
    ...(def.id === "ride_coaster" ? [["Circuit", circuit.closed ? `${circuit.pieces} pieces · ${Math.round(circuit.length)} m · ${circuit.lapSeconds.toFixed(1)} s` : `${tracks} laid · loop open`],
      ["Fright", `${circuit.excitement.toFixed(1)} · dread ${circuit.nausea.toFixed(1)}`], ["Drop · pace", `${circuit.drop.toFixed(1)} m · ${circuit.averageSpeed.toFixed(1)} m/s`]] as [string, string][] : []),
    ...(def.stall !== undefined ? [["Stock", `${stockOf(w, obj)}/${def.stall.stock}`], ["Sold", `${w.num(`${obj.id}.sold_total`)}`]] as [string, string][] : []),
  ];
  return {
    id: obj.id, broken, ordered: order !== null, repair, repairCost, repairRefusal, shut, refurbishing, refitChoices, crew,
    status: `${PHASE_LABEL[phase ?? "idle"]} · ${riders ?? 0} aboard`,
    price: def.ride !== undefined ? ridePrice(w, obj.kind) : def.stall !== undefined ? stallPrice(w, obj.kind) : 0,
    fair: Math.floor(fairPrice(w, obj, def.ride !== undefined ? excitement : 0)),
    wearLeft: Number(wear ?? 0) === 0 ? "good as new" : `${wear} wear left`,
    patrol: def.staff !== undefined ? patrolRadius(w, obj.id) : 0,
    rows,
  };
}
