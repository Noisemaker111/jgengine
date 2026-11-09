import { Fragment, type ReactNode } from "react";
import { useGame, useGameStore } from "@jgengine/react/hooks";
import { useGameContext } from "@jgengine/react/provider";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { live } from "@jgengine/core/ui/liveValue";
import { KitButton, KitMeter, KitPanel } from "@jgengine/core/ui/kit/uiKitRoot.view";

import { session } from "../../session";
import { guestRidePreference, rideFit, rideThrill } from "../../sim/rideExperience";
import { coasterCircuit, rideView, trackPieces } from "../../rides";
import { parkDuration } from "../../books";
import { fairPrice, park, parkObject, patrolRadius, PATROL, reliability, repairAction, ridePrice, stallPrice, stockOf } from "../../park";
import { accessOf, connectCost } from "../../build/links";
import { refundOf } from "../../parkScene";
import { isShut, refitLadder, refitOf, REFITS, reopenAction, rideUpkeep, shutAction, SHUT_UPKEEP } from "../../rideRefits";
import { upgradeOptions } from "@jgengine/core/worldModel/upgradePaths";
import { GuestPanel } from "./GuestPanel";

const PHASE_LABEL: Record<string, string> = { idle: "Ready", loading: "Boarding", riding: "On the ride", unloading: "Unloading", broken: "Broken down" };

/** Label/value lines, shared by the inspector, the guest window and the park books. */
export function Rows({ rows }: { rows: readonly (readonly [ReactNode, ReactNode])[] }) {
  return <dl className="bw-rows">{rows.map(([label, value], i) => <Fragment key={i}><dt>{label}</dt><dd>{value}</dd></Fragment>)}</dl>;
}

/** The close mark every inspected window carries. */
export function CloseButton({ label }: { label: string }) {
  const { commands } = useGame();
  return <KitButton variant="ghost" size="sm" cue="close" aria-label={label} onClick={() => commands.run("build.clear", {})}>✕</KitButton>;
}

/**
 * One structure, as the world holds it: its facts (broken, stock sold), the crew order on it and
 * what each action would cost, with buttons that run `brightway.act` and `brightway.remove`.
 */
export function Inspector() {
  const { commands } = useGame();
  const ctx = useGameContext();
  const selectedId = useGameStore(() => session.selectedObject);
  // Guests are selected through the engine's shared entity selection, which the shell draws the ring from.
  const selectedGuest = useGameStore((c) => { const [id] = c.scene.entity.selection.list(); return id !== undefined && session.guests.has(id) ? id : null; });
  const v = useGameStore((c) => (selectedGuest !== null ? null : inspectorView(c, selectedId)));
  if (selectedGuest !== null) return <GuestPanel id={selectedGuest} />;
  if (v === null) return null;
  const obj = parkObject(ctx, v.id);
  if (obj === undefined) return null;
  const def = obj.def;
  const act = (action: string) => commands.run("brightway.act", { action, target: obj.id });
  const { broken, ordered, repair, repairCost, repairRefusal, shut, refurbishing, refitChoices, crew } = v;
  return (
    <KitPanel variant="card" aria-label={`${def.label} details`} eyebrow={`${def.icon} ${def.category}`} title={def.label} aside={<CloseButton label="Close inspector" />}
      footer={<>
        {def.ride === undefined ? null : broken && !ordered
          ? <KitButton size="sm" variant="primary" disabled={repairRefusal !== null} title={repairRefusal ?? undefined} onClick={() => { if (repair !== null) act(repair); }}>Send the mechanic · ${repairCost}</KitButton>
          : <KitButton size="sm" variant="primary" disabled={broken} onClick={() => act(`service_${obj.kind}`)}>Service · ${def.ride.breakdown.serviceCost}</KitButton>}
        <KitButton size="sm" tone="bad" onClick={() => commands.run("build.demolish", { id: obj.id })}>Demolish · +${refundOf(obj.kind)}</KitButton>
      </>}>
      <p className="bw-blurb">{def.blurb}</p>
      {shut !== null ? <div className="bw-shut" role="status">
        <b data-bad="">Closed · {shut.reason}</b>
        <KitButton size="sm" variant="primary" data-hint="connect" onClick={() => commands.run("build.connect", { id: obj.id })}>Connect it · ${shut.cost}</KitButton>
      </div> : null}
      {def.ride !== undefined ? <>
        <div className="bw-line"><b data-bad={broken ? "" : undefined}>{broken ? `Offline · ${crew}` : v.status}</b>
          <span className="bw-stepper"><KitButton size="sm" aria-label="Lower ride ticket" onClick={() => act(`price_down_${obj.kind}`)}>−</KitButton><b>${v.price}</b>
            <KitButton size="sm" aria-label="Raise ride ticket" onClick={() => act(`price_up_${obj.kind}`)}>+</KitButton></span></div>
        <div className="bw-line"><span>Guests pay up to</span><b>${v.fair}</b></div>
        <div className="bw-line" role="status">{refurbishing
          ? <><span><b>Refurbishing</b> · {v.wearLeft}</span>
            <KitButton size="sm" variant="primary" data-jg="reopen" onClick={() => act(reopenAction(obj.kind))}>Reopen</KitButton></>
          : <><span>Rest it at {Math.round(SHUT_UPKEEP * 100)}% upkeep</span>
            <KitButton size="sm" data-jg="shut" disabled={broken} title={broken ? "Repair it first" : undefined} onClick={() => act(shutAction(obj.kind))}>Refurbish</KitButton></>}</div>
        {refitChoices.length === 0 ? null : <div className="bw-refits" data-jg="refits">
          {refitChoices.map((option) => (
            <KitButton key={option.action} size="sm" data-jg={`refit-${option.branch ?? ""}`} disabled={option.refusal !== null} title={option.refusal ?? undefined} onClick={() => act(option.action)}>
              {option.label} · ${option.cost}
            </KitButton>
          ))}
          {refitChoices.map((option) => <small key={option.action}>{option.detail}</small>)}
        </div>}
        {ordered ? <KitMeter size="sm" label="Repair" value={live(() => repairProgress(ctx, obj.id))} max={1} readout={(progress) => `${Math.round(progress * 100)}%`} tone="warn" /> : null}
      </> : null}
      {def.stall !== undefined ? <div className="bw-line"><span>Price · guests pay up to ${v.fair}</span>
        <span className="bw-stepper"><KitButton size="sm" aria-label="Lower price" onClick={() => act(`price_down_${obj.kind}`)}>−</KitButton><b>${v.price}</b>
          <KitButton size="sm" aria-label="Raise price" onClick={() => act(`price_up_${obj.kind}`)}>+</KitButton></span></div> : null}
      {def.staff !== undefined ? <div className="bw-line"><span>Patrol area</span>
        <span className="bw-stepper"><KitButton size="sm" aria-label="Narrow the patrol" disabled={v.patrol <= PATROL.min} onClick={() => act(`patrol_narrower_${obj.kind}`)}>−</KitButton><b>{v.patrol} m</b>
          <KitButton size="sm" aria-label="Widen the patrol" disabled={v.patrol >= PATROL.max} onClick={() => act(`patrol_wider_${obj.kind}`)}>+</KitButton></span></div> : null}
      <Rows rows={v.rows} />
    </KitPanel>
  );
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
  const crew = order === null ? (w.num("n.staff_mechanic") < 1 ? "needs a mechanic" : "waiting for the mechanic") : order.active ? `mechanic on it · ${parkDuration(order.remaining)}` : "mechanic queued";
  const rows: [string, string][] = [
    ...(def.staff !== undefined ? [["Wage", `$${def.upkeep} / day`]] as [string, string][] : [
      ["Appeal", broken ? "0 while down" : w.num(`${obj.id}.appeal`).toFixed(1)],
      ["Upkeep", `$${def.ride === undefined ? def.upkeep : Math.round(rideUpkeep(w, obj.id, def))} / day`]] as [string, string][]),
    ...(def.ride !== undefined ? [["Scenery charm", `+${w.num(`${obj.id}.theme`).toFixed(1)}`], ...(refit === null ? [] : [["Refit", REFITS[refit].label]])] as [string, string][] : []),
    ...(access?.open && def.ride !== undefined ? [["Queue line", access.line.length > 0 ? `${access.line.length} tiles` : "none · guests wait at the entrance"]] as [string, string][] : []),
    ...(def.ride !== undefined ? [["In line", `${queued ?? 0} · ${Math.round(Number(waitSeconds ?? 0))}s wait`], ["Seats", `${view?.capacity ?? def.ride.capacity}`], ["Reliability", `${reliability(def, Number(wear ?? 0), w.num(`${obj.id}.wear_scale`))}% · ${wear ?? 0} runs since service`], ["Breakdowns", `${breakdowns ?? 0} in ${cycles ?? 0} runs`], ["Intensity", rideThrill(def.id, circuit).toFixed(1)],
      ...["guest_a", "guest_c", "guest_d"].map((kind) => [`${guestRidePreference(kind).label} fit`, `${Math.round(rideFit(kind, def.id, circuit) * 100)}%`])] as [string, string][] : []),
    ...(def.id === "ride_coaster" ? [["Circuit", circuit.closed ? `${circuit.pieces} pieces · ${Math.round(circuit.length)} m · ${circuit.lapSeconds.toFixed(1)} s` : `${tracks} laid · loop open`],
      ["Excitement", `${circuit.excitement.toFixed(1)} · nausea ${circuit.nausea.toFixed(1)}`], ["Drop · pace", `${circuit.drop.toFixed(1)} m · ${circuit.averageSpeed.toFixed(1)} m/s`]] as [string, string][] : []),
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
