export interface Modifier<V> {
  id: string;
  source?: string;
  apply: (value: V, context: PipelineContext<V>) => V;
}

export interface PipelineContext<V> {
  base: V;
  index: number;
  trace: readonly TraceStep<V>[];
}

export interface TraceStep<V> {
  id: string;
  source?: string;
  index: number;
  before: V;
  after: V;
  changed: boolean;
}

export interface PipelineResult<V> {
  base: V;
  value: V;
  trace: readonly TraceStep<V>[];
}

export function runPipeline<V>(
  base: V,
  modifiers: readonly Modifier<V>[],
  equals: (a: V, b: V) => boolean = Object.is,
): PipelineResult<V> {
  const trace: TraceStep<V>[] = [];
  let value = base;
  let index = 0;
  for (const modifier of modifiers) {
    const before = value;
    const after = modifier.apply(before, { base, index, trace });
    trace.push({
      id: modifier.id,
      source: modifier.source,
      index,
      before,
      after,
      changed: !equals(before, after),
    });
    value = after;
    index += 1;
  }
  return { base, value, trace };
}

export interface ModifierPipeline<V> {
  add(modifier: Modifier<V>): void;
  insertAt(index: number, modifier: Modifier<V>): void;
  remove(id: string): boolean;
  clear(): void;
  list(): readonly Modifier<V>[];
  run(base: V): PipelineResult<V>;
}

export function createModifierPipeline<V>(
  initial: readonly Modifier<V>[] = [],
  equals: (a: V, b: V) => boolean = Object.is,
): ModifierPipeline<V> {
  const modifiers: Modifier<V>[] = initial.slice();
  return {
    add(modifier) {
      modifiers.push(modifier);
    },
    insertAt(index, modifier) {
      const clamped = Math.max(0, Math.min(modifiers.length, Math.floor(index)));
      modifiers.splice(clamped, 0, modifier);
    },
    remove(id) {
      const at = modifiers.findIndex((m) => m.id === id);
      if (at === -1) return false;
      modifiers.splice(at, 1);
      return true;
    },
    clear() {
      modifiers.length = 0;
    },
    list() {
      return modifiers.slice();
    },
    run(base) {
      return runPipeline(base, modifiers, equals);
    },
  };
}
