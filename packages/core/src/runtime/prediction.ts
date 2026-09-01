import type { InputFrame } from "./inputSnapshot";

export type PredictionStep<S> = (state: S, input: InputFrame, dt: number) => S;

export type PredictionRecord<S> = { tick: number; input: InputFrame; state: S; dt: number };

export type PredictionSnapshot<S> = {
  confirmedTick: number;
  confirmed: S;
  predicted: S;
  records: PredictionRecord<S>[];
};

export type PredictionBuffer<S> = {
  record(input: InputFrame, dt?: number, observedState?: S): S;
  reconcile(tick: number, authoritative: S): { error: number; replayed: number; snapped: boolean; state: S };
  state(): S;
  snapshot(): PredictionSnapshot<S>;
  restore(next: PredictionSnapshot<S>): void;
};

/**
 * Keeps local input predictions ahead of the last server confirmation. Reconciliation replaces the
 * confirmed state and deterministically replays unconfirmed inputs through the supplied step function.
 * `maxTicks` bounds retained work and memory; dropped inputs are folded into the confirmed baseline.
 * @capability client-side input prediction with replay reconciliation
 */
export function createPredictionBuffer<S>(config: {
  initial: S;
  step: PredictionStep<S>;
  maxTicks: number;
  startTick?: number;
  dt?: number;
  /** Error above which a caller should snap its rendered pose to the reconciled result. */
  snapThreshold?: number;
}): PredictionBuffer<S> {
  const maxTicks = Math.max(1, Math.floor(config.maxTicks));
  const step = config.step;
  let confirmedTick = config.startTick ?? 0;
  let confirmed = config.initial;
  let predicted = config.initial;
  let records: PredictionRecord<S>[] = [];
  const defaultDt = config.dt ?? 1 / 60;
  const snapThreshold = Math.max(0, config.snapThreshold ?? 0.1);

  const replay = (base: S, pending: PredictionRecord<S>[]) => {
    let next = base;
    for (const record of pending) next = step(next, record.input, record.dt);
    return next;
  };

  return {
    record(input, dt = defaultDt, observedState) {
      const tick = confirmedTick + records.length + 1;
      const state = observedState === undefined ? step(predicted, input, dt) : observedState;
      records.push({ tick, input, state, dt });
      predicted = state;
      if (records.length > maxTicks) {
        const oldest = records.shift()!;
        confirmedTick = oldest.tick;
        confirmed = oldest.state;
      }
      return predicted;
    },
    reconcile(tick, authoritative) {
      const predictedAtTick = records.find((record) => record.tick === tick)?.state ?? confirmed;
      const distance = (a: unknown, b: unknown): number => {
        if (typeof a === "number" && typeof b === "number") return Math.abs(a - b);
        if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v) => typeof v === "number") && b.every((v) => typeof v === "number")) {
          return Math.sqrt(a.reduce((sum, value, index) => sum + (Number(value) - Number(b[index])) ** 2, 0));
        }
        return JSON.stringify(a) === JSON.stringify(b) ? 0 : 1;
      };
      const dx = distance(predictedAtTick, authoritative);
      const pending = records.filter((record) => record.tick > tick);
      confirmedTick = tick;
      confirmed = authoritative;
      records = pending;
      predicted = replay(confirmed, records);
      return { error: dx, replayed: records.length, snapped: dx > snapThreshold, state: predicted };
    },
    state: () => predicted,
    snapshot: () => ({ confirmedTick, confirmed, predicted, records: records.map((record) => ({ ...record })) }),
    restore(next) {
      confirmedTick = next.confirmedTick;
      confirmed = next.confirmed;
      predicted = next.predicted;
      records = next.records.map((record) => ({ ...record }));
    },
  };
}
