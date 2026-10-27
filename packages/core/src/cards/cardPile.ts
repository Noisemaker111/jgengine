// @skill jgengine-gameplay
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
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** The cards in `zone`, top first; an undeclared zone throws. */
function cardsIn(state: CardPileState, zone: ZoneName): readonly string[] {
  const cards = Object.hasOwn(state.zones, zone) ? state.zones[zone] : undefined;
  if (cards === undefined) throw new Error(`unknown card-pile zone: ${zone}`);
  return cards;
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
  return cardsIn(state, zone).length;
}

export function peek(state: CardPileState, zone: ZoneName, n = 1): readonly string[] {
  return cardsIn(state, zone).slice(0, Math.max(0, n));
}

export function shuffleZone(
  state: CardPileState,
  zone: ZoneName,
  seed: string | number,
): CardPileState {
  return { zones: { ...state.zones, [zone]: shuffleWithRng(cardsIn(state, zone), pileRng(seed)) } };
}

export function moveCards(
  state: CardPileState,
  ids: readonly string[],
  from: ZoneName,
  to: ZoneName,
  position: "top" | "bottom" = "top",
): PileResult {
  const source = cardsIn(state, from);
  const dest = cardsIn(state, to);
  for (const id of ids) {
    if (!source.includes(id)) return { status: "rejected", reason: "card-not-in-zone", detail: id };
  }
  const idSet = new Set(ids);
  const nextFrom = source.filter((id) => !idSet.has(id));
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
  cardsIn(state, options.from);
  cardsIn(state, options.to);
  if (options.reshuffleFrom !== undefined) cardsIn(state, options.reshuffleFrom);
  let current = state;
  let reshuffled = false;
  const drawn: string[] = [];
  const wanted = Math.max(0, Math.floor(n));
  for (let i = 0; i < wanted; i++) {
    if (options.handLimit !== undefined && cardsIn(current, options.to).length >= options.handLimit) {
      break;
    }
    if (cardsIn(current, options.from).length === 0) {
      if (options.reshuffleFrom === undefined || cardsIn(current, options.reshuffleFrom).length === 0) {
        break;
      }
      const seed = options.seed ?? drawn.length + i;
      const shuffledSource = shuffleWithRng(cardsIn(current, options.reshuffleFrom), pileRng(seed));
      current = {
        zones: { ...current.zones, [options.from]: shuffledSource, [options.reshuffleFrom]: [] },
      };
      reshuffled = true;
    }
    const [top, ...rest] = cardsIn(current, options.from);
    if (top === undefined) break;
    drawn.push(top);
    current = {
      zones: {
        ...current.zones,
        [options.from]: rest,
        [options.to]: [...cardsIn(current, options.to), top],
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
  const first = config.zones[0];
  const last = config.zones.at(-1);
  if (first === undefined || last === undefined) throw new Error("card pile needs at least one zone");
  const drawFrom = config.drawFrom ?? first;
  const handZone = config.handZone ?? config.zones[1] ?? first;
  const discardTo = config.discardTo ?? last;
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
        ...(config.handLimit === undefined ? {} : { handLimit: config.handLimit }),
        ...(config.reshuffleFrom === undefined ? {} : { reshuffleFrom: config.reshuffleFrom }),
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

// Measurement line batch2.
