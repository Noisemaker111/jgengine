export type ZoneName = string;

export interface CardPileConfig {
  zones: readonly ZoneName[];
  drawFrom?: ZoneName;
  discardTo?: ZoneName;
  handZone?: ZoneName;
  handLimit?: number;
  reshuffleFrom?: ZoneName;
  onChange?: () => void;
}

export interface CardPileState {
  readonly zones: Readonly<Record<ZoneName, readonly string[]>>;
}

export interface DrawResult {
  state: CardPileState;
  drawn: readonly string[];
  reshuffled: boolean;
}

export type PileRejection =
  | "unknown-zone"
  | "card-not-in-zone"
  | "hand-limit"
  | "empty-source";

export interface PileMoveResult {
  status: "ok";
  state: CardPileState;
}

export interface PileMoveRejected {
  status: "rejected";
  reason: PileRejection;
  detail?: string;
}

export type PileResult = PileMoveResult | PileMoveRejected;

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pileRng(seed: string | number): () => number {
  let a = (typeof seed === "number" ? seed >>> 0 : fnv1a(seed)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithRng<T>(values: readonly T[], rng: () => number): T[] {
  const out = values.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function assertZone(state: CardPileState, zone: ZoneName): void {
  if (!(zone in state.zones)) throw new Error(`unknown card-pile zone: ${zone}`);
}

export function createCardPileState(
  config: CardPileConfig,
  initial?: Partial<Record<ZoneName, readonly string[]>>,
): CardPileState {
  if (config.zones.length === 0) throw new Error("card pile needs at least one zone");
  const zones: Record<ZoneName, readonly string[]> = {};
  for (const zone of config.zones) zones[zone] = (initial?.[zone] ?? []).slice();
  const guard = (zone: ZoneName | undefined, label: string): void => {
    if (zone !== undefined && !(zone in zones)) {
      throw new Error(`${label} names an undeclared zone: ${zone}`);
    }
  };
  guard(config.drawFrom, "drawFrom");
  guard(config.discardTo, "discardTo");
  guard(config.handZone, "handZone");
  guard(config.reshuffleFrom, "reshuffleFrom");
  return { zones };
}

export function zoneOf(state: CardPileState, cardId: string): ZoneName | null {
  for (const [zone, cards] of Object.entries(state.zones)) {
    if (cards.includes(cardId)) return zone;
  }
  return null;
}

export function countIn(state: CardPileState, zone: ZoneName): number {
  assertZone(state, zone);
  return state.zones[zone].length;
}

export function peek(state: CardPileState, zone: ZoneName, n = 1): readonly string[] {
  assertZone(state, zone);
  return state.zones[zone].slice(0, Math.max(0, n));
}

export function shuffleZone(
  state: CardPileState,
  zone: ZoneName,
  seed: string | number,
): CardPileState {
  assertZone(state, zone);
  return { zones: { ...state.zones, [zone]: shuffleWithRng(state.zones[zone], pileRng(seed)) } };
}

export function moveCards(
  state: CardPileState,
  ids: readonly string[],
  from: ZoneName,
  to: ZoneName,
  position: "top" | "bottom" = "top",
): PileResult {
  assertZone(state, from);
  assertZone(state, to);
  const source = state.zones[from];
  for (const id of ids) {
    if (!source.includes(id)) return { status: "rejected", reason: "card-not-in-zone", detail: id };
  }
  const idSet = new Set(ids);
  const nextFrom = source.filter((id) => !idSet.has(id));
  const dest = state.zones[to];
  const nextTo = position === "top" ? [...ids, ...dest] : [...dest, ...ids];
  return { status: "ok", state: { zones: { ...state.zones, [from]: nextFrom, [to]: nextTo } } };
}

export function draw(
  state: CardPileState,
  n: number,
  options: {
    from: ZoneName;
    to: ZoneName;
    handLimit?: number;
    reshuffleFrom?: ZoneName;
    seed?: string | number;
  },
): DrawResult {
  assertZone(state, options.from);
  assertZone(state, options.to);
  if (options.reshuffleFrom !== undefined) assertZone(state, options.reshuffleFrom);
  let current = state;
  let reshuffled = false;
  const drawn: string[] = [];
  const wanted = Math.max(0, Math.floor(n));
  for (let i = 0; i < wanted; i++) {
    if (options.handLimit !== undefined && current.zones[options.to].length >= options.handLimit) {
      break;
    }
    if (current.zones[options.from].length === 0) {
      if (options.reshuffleFrom === undefined || current.zones[options.reshuffleFrom].length === 0) {
        break;
      }
      const seed = options.seed ?? drawn.length + i;
      const shuffledSource = shuffleWithRng(current.zones[options.reshuffleFrom], pileRng(seed));
      current = {
        zones: { ...current.zones, [options.from]: shuffledSource, [options.reshuffleFrom]: [] },
      };
      reshuffled = true;
    }
    const source = current.zones[options.from];
    const top = source[0];
    drawn.push(top);
    current = {
      zones: {
        ...current.zones,
        [options.from]: source.slice(1),
        [options.to]: [...current.zones[options.to], top],
      },
    };
  }
  return { state: current, drawn, reshuffled };
}

export interface CardPile {
  state(): CardPileState;
  zones(): readonly ZoneName[];
  count(zone: ZoneName): number;
  peek(zone: ZoneName, n?: number): readonly string[];
  zoneOf(cardId: string): ZoneName | null;
  shuffle(zone: ZoneName | undefined, seed: string | number): void;
  draw(n: number, options?: { from?: ZoneName; to?: ZoneName }): readonly string[];
  discard(ids: readonly string[], options?: { from?: ZoneName; to?: ZoneName }): PileResult;
  exhaust(ids: readonly string[], exhaustZone: ZoneName, from?: ZoneName): PileResult;
  move(ids: readonly string[], from: ZoneName, to: ZoneName, position?: "top" | "bottom"): PileResult;
  reset(next: CardPileState): void;
}

export function createCardPile(
  config: CardPileConfig,
  initial?: Partial<Record<ZoneName, readonly string[]>>,
): CardPile {
  let state = createCardPileState(config, initial);
  const drawFrom = config.drawFrom ?? config.zones[0];
  const handZone = config.handZone ?? config.zones[Math.min(1, config.zones.length - 1)];
  const discardTo = config.discardTo ?? config.zones[config.zones.length - 1];
  return {
    state: () => state,
    zones: () => config.zones,
    count: (zone) => countIn(state, zone),
    peek: (zone, n) => peek(state, zone, n),
    zoneOf: (cardId) => zoneOf(state, cardId),
    shuffle(zone, seed) {
      state = shuffleZone(state, zone ?? drawFrom, seed);
      config.onChange?.();
    },
    draw(n, options) {
      const result = draw(state, n, {
        from: options?.from ?? drawFrom,
        to: options?.to ?? handZone,
        handLimit: config.handLimit,
        reshuffleFrom: config.reshuffleFrom,
      });
      state = result.state;
      config.onChange?.();
      return result.drawn;
    },
    discard(ids, options) {
      const result = moveCards(state, ids, options?.from ?? handZone, options?.to ?? discardTo, "top");
      if (result.status === "ok") {
        state = result.state;
        config.onChange?.();
      }
      return result;
    },
    exhaust(ids, exhaustZone, from) {
      const result = moveCards(state, ids, from ?? handZone, exhaustZone, "top");
      if (result.status === "ok") {
        state = result.state;
        config.onChange?.();
      }
      return result;
    },
    move(ids, from, to, position) {
      const result = moveCards(state, ids, from, to, position);
      if (result.status === "ok") {
        state = result.state;
        config.onChange?.();
      }
      return result;
    },
    reset(next) {
      state = next;
      config.onChange?.();
    },
  };
}
