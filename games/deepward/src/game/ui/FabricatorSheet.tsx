import type { useDialogBehavior } from "@jgengine/react";
import { HudButton } from "@jgengine/react/hudButton";
import { HudSurface } from "@jgengine/react/hudSurface";
import type { WorldModel } from "@jgengine/core/worldModel/worldModel";
import { BAYS } from "../../world";
import { ITEMS, type ItemKind } from "../state";
import { kindOf } from "../items";
import { CODEX_ENTRIES, createDeepCodex, GEAR, GEAR_ORDER, gearMissing } from "../fabricator";
import { MODULE_ORDER, MODULES } from "../marrow";
import { goals, type Deep } from "../deep";
import { STRATA, STRATUM_ORDER } from "../strata";
import type { Home } from "../state";

const name = (id: string) => ITEMS[id as ItemKind]?.name ?? id;
const cost = (inputs: readonly { itemId: string; count: number }[]) => inputs.map(input => `${input.count} ${name(input.itemId)}`).join(" + ");

/**
 * Marrow's fabricator, in the stash sheet's own layout: what the scanner has learned, what it can
 * print from banked salvage, what the bays hold, the crawler's landing, and the logs read so far.
 */
export function FabricatorSheet({ dialogRef, home, deep, world, departTo, hint, error, command, close }: {
  dialogRef: ReturnType<typeof useDialogBehavior>; home: Home; deep: Deep; world: WorldModel; departTo: string; hint: string; error: string;
  command: (name: string, input?: unknown) => void; close: () => void;
}) {
  const codex = createDeepCodex(deep.codex);
  const instances = world.instances(), orders = world.orders();
  const progress = (instanceId: string) => orders.find(order => order.target === instanceId);
  const power = world.num("marrow.power");
  const plan = goals(deep, world);
  const logs = CODEX_ENTRIES.filter(entry => entry.meta?.kind === "log" && codex.isDiscovered(entry.id));
  const fauna = CODEX_ENTRIES.filter(entry => entry.meta?.kind === "fauna" && codex.isDiscovered(entry.id));
  const said = world.says("halloway");
  return <div className="dw-modal"><HudSurface ref={dialogRef} elevation="modal" data-hud-window className="dw-sheet" aria-label="Marrow fabricator" role="dialog" aria-modal="true" tabIndex={-1}>
    <HudButton className="dw-sheet-close" onClick={close}>Close fabricator ×</HudButton>
    <span className="dw-eyebrow">Fabricator / blueprints from scans, paid from the stash</span><h2>Marrow's fabricator</h2>
    {said.length > 0 && <p><strong>Halloway:</strong> {said[said.length - 1]}</p>}
    <h3>The job</h3>
    <ol className="dw-journal" aria-label="Story goals">{plan.map(goal => <li key={goal.id}><span>{goal.text}</span><strong>{goal.done ? " / done" : goal === plan.find(g => !g.done) ? " / next" : ""}</strong></li>)}</ol>
    <h3>Gear / {deep.gear.length} printed, {deep.lures} {deep.lures === 1 ? "lure" : "lures"} waiting</h3>
    {GEAR_ORDER.map(id => {
      const gear = GEAR[id], view = codex.get(id), known = view?.discovered === true;
      const owned = gear.permanent && deep.gear.includes(id), missing = gearMissing(home.stash, id);
      return <article className="dw-refit" key={id}>
        <h4>{gear.name}{owned ? " / printed" : known ? "" : ` / blueprint ${view?.scanned ?? 0} of ${view?.fragments ?? 1} scanned`}</h4>
        <p>{gear.effect}. Cost: {cost(gear.recipe.inputs)}.</p>
        <HudButton disabled={!known || owned || missing.length > 0} onClick={() => command("print", { gear: id })}>
          {owned ? `${gear.name} printed` : !known ? "Scan its fragments in Bellwether" : missing.length > 0 ? `Need ${cost(missing)}` : `Print ${gear.name}`}
        </HudButton>
      </article>;
    })}
    <h3>Bays / power {power >= 0 ? `+${power}` : power}{power < 0 ? " / nothing runs" : ""}</h3>
    <p>Galley {Math.floor(world.num("marrow.food"))} rations, {Math.floor(world.num("marrow.water"))} water. Modules build over time while Marrow runs.</p>
    <div className="dw-stash-list">{BAYS.map((bay, index) => {
      const built = instances.find(instance => instance.slot === bay.id);
      const order = built === undefined ? undefined : progress(built.id);
      return <article key={bay.id}><div><strong>Bay {index + 1}</strong><p>{built === undefined ? "Empty" : `${built.label}${built.ready ? power >= 0 ? " / running" : " / no power" : ` / building ${Math.round((order?.progress ?? 0) * 100)}%`}`}</p></div></article>;
    })}</div>
    {MODULE_ORDER.map(id => {
      const module = MODULES[id], missing = missingFor(home, module.recipe.inputs);
      const refusal = world.canPlace(id, { slot: BAYS.find(bay => world.occupant(bay.id) === null)?.id ?? BAYS[0]!.id }, { free: true });
      return <article className="dw-refit" key={id}>
        <h4>{module.name} / {module.power > 0 ? `+${module.power}` : module.power} power</h4>
        <p>{module.effect}. Cost: {cost(module.recipe.inputs)}.</p>
        <HudButton disabled={refusal !== null || missing.length > 0} onClick={() => command("build", { module: id })}>
          {refusal !== null ? refusal.message : missing.length > 0 ? `Need ${cost(missing)}` : `Build ${module.name}`}
        </HudButton>
      </article>;
    })}
    {deep.gear.includes("crawler") && <>
      <h3>Crawler landing</h3>
      <div className="dw-actions">{STRATUM_ORDER.filter(stratum => deep.charted.includes(stratum)).map(stratum =>
        <HudButton key={stratum} aria-pressed={departTo === stratum} onClick={() => command("departTo", { stratum })}>{STRATA[stratum].numeral} · {STRATA[stratum].name}</HudButton>)}</div>
    </>}
    {(logs.length > 0 || fauna.length > 0) && <h3>Codex / {codex.discoveredCount()} of {codex.total()}</h3>}
    {[...logs, ...fauna].map(entry => <article className="dw-refit" key={entry.id}><h4>{entry.name}</h4><p>{entry.meta?.text}</p></article>)}
    <p role="status">{hint}</p>{error && <p role="alert">{error}</p>}
    <div className="dw-actions"><HudButton onClick={close}>Back to Marrow</HudButton></div>
  </HudSurface></div>;
}
function missingFor(home: Home, inputs: readonly { itemId: string; count: number }[]) {
  const have = new Map<string, number>();
  for (const item of home.stash) { const kind = kindOf(item); have.set(kind, (have.get(kind) ?? 0) + 1); }
  return inputs.filter(input => (have.get(input.itemId) ?? 0) < input.count).map(input => ({ itemId: input.itemId, count: input.count - (have.get(input.itemId) ?? 0) }));
}
