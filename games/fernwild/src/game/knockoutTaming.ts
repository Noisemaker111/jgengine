import { evalCurve } from "@jgengine/core/progression/leveling";
import { createDoseTable, type DoseSupply, type DoseTable } from "@jgengine/core/stats/doseTable";
import { createVitals, type VitalDose, type Vitals, type VitalsState } from "@jgengine/core/stats/vitals";

import { effectivenessOf, HIT_INEFFECTIVENESS, STARVE_LOSS, type TamingDef, tamingBody, TORPOR_DRAIN, WAKES_AT } from "./data/taming";

export type TamingEvent = { type: "subdued" } | { type: "ate"; itemId: string } | { type: "released" } | { type: "won"; effectiveness: number };

export interface TamingRead {
  subdued: boolean;
  torpor: number;
  maxTorpor: number;
  /** Affinity as a share of the tame, 0..1. */
  progress: number;
  effectiveness: number;
  /** Seconds of digestion left before it eats again, at taming speed 1. */
  belly: number;
  /** Seconds a bola or trap still holds it still. */
  held: number;
  /** Seconds until its torpor, and the narcotics still taking effect, wear off and it wakes; 0 when awake. */
  wakesIn: number;
  /** Tamed awake by hand-feeding rather than knocked out. */
  awakeTame: boolean;
}

export type OfferResult = { type: "ate"; itemId: string } | { type: "full"; seconds: number } | { type: "refuses" } | { type: "not-awake-tame" };

interface Tracked {
  kind: string;
  level: number;
  down: boolean;
  awake: boolean;
  body: Vitals;
}

export interface TamingSave {
  kind: string;
  level: number;
  down: boolean;
  body: VitalsState;
}

export function createKnockoutTaming(defs: Readonly<Record<string, TamingDef>>) {
  const diet: DoseTable = createDoseTable(Object.fromEntries(Object.entries(defs).map(([kind, def]) => [kind, def.foods])));
  const tracked = new Map<string, Tracked>();

  const bodyFor = (kind: string, level: number): Vitals | null => {
    const def = defs[kind];
    return def === undefined ? null : createVitals(tamingBody(def, level));
  };

  const loseTheTame = (entry: Tracked): void => {
    for (const vital of ["affinity", "ineffectiveness", "belly"]) entry.body.change(vital, -entry.body.value(vital));
  };

  const wakesIn = (entry: Tracked): number => {
    if (!entry.down) return 0;
    const drain = evalCurve(TORPOR_DRAIN, entry.level);
    const max = entry.body.max("torpor");
    let landing = 0;
    let longest = 0;
    for (const dose of entry.body.doses()) {
      if (dose.vital !== "torpor") continue;
      landing += dose.amount;
      longest = Math.max(longest, dose.seconds ?? 0);
    }
    const total = Math.min(entry.body.value("torpor") + landing, max + drain * longest);
    return Math.max(0, (total - WAKES_AT * max) / drain);
  };

  const read = (entry: Tracked): TamingRead => ({
    subdued: entry.down,
    torpor: entry.body.value("torpor"),
    maxTorpor: entry.body.max("torpor"),
    progress: entry.body.fraction("affinity"),
    effectiveness: effectivenessOf(entry.body.value("ineffectiveness")),
    belly: entry.body.value("belly"),
    held: entry.body.value("held"),
    wakesIn: wakesIn(entry),
    awakeTame: entry.awake,
  });

  const entryFor = (kind: string, level: number, down: boolean, body: Vitals): Tracked => ({ kind, level, down, awake: defs[kind]?.awake === true, body });

  return {
    track(id: string, kind: string, level: number): void {
      if (tracked.has(id)) return;
      const body = bodyFor(kind, level);
      if (body !== null) tracked.set(id, entryFor(kind, level, false, body));
    },
    forget(id: string): void {
      tracked.delete(id);
    },
    state(id: string): TamingRead | null {
      const entry = tracked.get(id);
      return entry === undefined ? null : read(entry);
    },
    foods: (kind: string): readonly string[] => diet.sources(kind),
    nextFood(kind: string, supply: DoseSupply): string | null {
      return diet.pick(kind, (itemId) => supply.count(itemId) > 0);
    },
    offer(id: string, supply: DoseSupply): OfferResult {
      const entry = tracked.get(id);
      if (entry === undefined || !entry.awake || entry.down) return { type: "not-awake-tame" };
      const belly = entry.body.value("belly");
      if (belly > 0) return { type: "full", seconds: belly };
      const itemId = diet.pick(entry.kind, (food) => supply.count(food) > 0);
      if (itemId === null || !supply.take(itemId)) return { type: "refuses" };
      entry.body.dose(...(diet.of(entry.kind, itemId) ?? []));
      return { type: "ate", itemId };
    },
    hit(id: string, doses: readonly VitalDose[]): boolean {
      const entry = tracked.get(id);
      if (entry === undefined) return false;
      if (entry.awake) loseTheTame(entry);
      entry.body.dose(...doses);
      if (entry.down || !entry.body.has("unconscious")) return false;
      entry.down = true;
      return true;
    },
    hurt(id: string, share: number): void {
      const entry = tracked.get(id);
      if (entry?.down === true) entry.body.change("ineffectiveness", HIT_INEFFECTIVENESS * Math.max(0, share));
    },
    dose(id: string, ...doses: readonly VitalDose[]): void {
      tracked.get(id)?.body.dose(...doses);
    },
    tick(dt: number, supplyOf: (id: string) => DoseSupply | null, pace = 1): { id: string; event: TamingEvent }[] {
      const out: { id: string; event: TamingEvent }[] = [];
      for (const [id, entry] of tracked) {
        if (entry.down && !entry.awake && entry.body.value("belly") <= 0) {
          const supply = supplyOf(id);
          const itemId = supply === null ? null : diet.pick(entry.kind, (food) => supply.count(food) > 0);
          if (supply !== null && itemId !== null && supply.take(itemId)) {
            entry.body.dose(...(diet.of(entry.kind, itemId) ?? []));
            out.push({ id, event: { type: "ate", itemId } });
          } else {
            // Hungry with nothing it will eat: the tame slips away.
            entry.body.change("affinity", -STARVE_LOSS * entry.body.max("affinity") * dt);
          }
        }
        for (const flag of entry.body.tick(dt, { drain: { belly: pace } })) {
          if (flag.id === "unconscious" && flag.raised && !entry.down) {
            entry.down = true;
            out.push({ id, event: { type: "subdued" } });
          } else if (flag.id === "unconscious" && !flag.raised && entry.down) {
            entry.down = false;
            loseTheTame(entry);
            out.push({ id, event: { type: "released" } });
          } else if (flag.id === "tamed" && flag.raised && (entry.down || entry.awake)) {
            out.push({ id, event: { type: "won", effectiveness: effectivenessOf(entry.body.value("ineffectiveness")) } });
            tracked.delete(id);
          }
        }
        // Awake, nothing it eats sticks (affinity only builds while out), unless it is tamed awake.
        if (!entry.down && !entry.awake && entry.body.value("affinity") > 0) loseTheTame(entry);
      }
      return out;
    },
    snapshot(): Record<string, TamingSave> {
      return Object.fromEntries([...tracked].map(([id, entry]) => [id, { kind: entry.kind, level: entry.level, down: entry.down, body: entry.body.state() }]));
    },
    restore(data: Readonly<Record<string, TamingSave>>): void {
      tracked.clear();
      for (const [id, save] of Object.entries(data)) {
        const body = save.body === undefined ? null : bodyFor(save.kind, save.level);
        if (body === null) continue;
        body.restore(save.body);
        tracked.set(id, entryFor(save.kind, save.level, save.down, body));
      }
    },
    reset(): void {
      tracked.clear();
    },
  };
}

export type KnockoutTaming = ReturnType<typeof createKnockoutTaming>;
