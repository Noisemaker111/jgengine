/**
 * Binary wire format for the ws protocol. Every message is a JSON-shaped value, so one tagged value
 * codec carries all of them; world frames add an entity-delta section that sends only the fields that
 * changed against the last frame on that connection, with quantised poses and varint entity ids.
 */

/** Marks a binary frame (JSON text frames start with `{`, never this byte). */
export const WIRE_MAGIC = 0xb1;

const KIND_GENERIC = 0;
const KIND_WORLD = 1;

const T_NULL = 0;
const T_FALSE = 1;
const T_TRUE = 2;
const T_INT = 3;
const T_FLOAT = 4;
const T_STRING = 5;
const T_ARRAY = 6;
const T_OBJECT = 7;

const MAX_DEPTH = 32;
const MAX_SAFE_INT = 2 ** 51;

/** Common protocol keys sent as one varint instead of a string. Append only: both ends must agree. */
const KEY_DICTIONARY: readonly string[] = [
  "v", "t", "id", "at", "serverAt", "ok", "reason", "result", "channel", "serverId", "action", "data",
  "userId", "token", "gameId", "attributes", "code", "role", "sessionId", "filter", "limit", "command",
  "input", "entry", "pose", "x", "y", "z", "rotationY", "rotationPitch", "appearance", "channelId", "body",
  "streamId", "kind", "revision", "snapshot", "diff", "baseRevision", "entities", "removedEntities", "stats",
  "removedStats", "store", "removedStore", "modules", "removedModules", "memberUserIds", "serverState",
  "updatedAt", "playerState", "fromUserId", "name", "position", "movement", "meta", "codec",
];
const KEY_INDEX = new Map<string, number>(KEY_DICTIONARY.map((key, index) => [key, index + 1]));

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Writer {
  private bytes = new Uint8Array(256);
  private view = new DataView(this.bytes.buffer);
  length = 0;

  private reserve(extra: number): void {
    const need = this.length + extra;
    if (need <= this.bytes.length) return;
    let size = this.bytes.length * 2;
    while (size < need) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.bytes.subarray(0, this.length));
    this.bytes = next;
    this.view = new DataView(next.buffer);
  }

  byte(value: number): void {
    this.reserve(1);
    this.bytes[this.length] = value;
    this.length += 1;
  }

  varint(value: number): void {
    let rest = value;
    while (rest >= 128) {
      this.byte((rest % 128) | 128);
      rest = Math.floor(rest / 128);
    }
    this.byte(rest);
  }

  zigzag(value: number): void {
    this.varint(value >= 0 ? value * 2 : -value * 2 - 1);
  }

  float64(value: number): void {
    this.reserve(8);
    this.view.setFloat64(this.length, value);
    this.length += 8;
  }

  raw(data: Uint8Array): void {
    this.reserve(data.length);
    this.bytes.set(data, this.length);
    this.length += data.length;
  }

  string(value: string): void {
    const encoded = textEncoder.encode(value);
    this.varint(encoded.length);
    this.raw(encoded);
  }

  finish(): Uint8Array<ArrayBuffer> {
    return this.bytes.slice(0, this.length);
  }

  view8(): Uint8Array {
    return this.bytes.subarray(0, this.length);
  }
}

class Reader {
  pos = 0;
  private view: DataView;
  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  remaining(): number {
    return this.bytes.length - this.pos;
  }

  byte(): number {
    const value = this.bytes[this.pos];
    if (value === undefined) throw new Error("truncated frame");
    this.pos += 1;
    return value;
  }

  varint(): number {
    let result = 0;
    let scale = 1;
    for (let i = 0; i < 8; i += 1) {
      const b = this.byte();
      result += (b & 127) * scale;
      if (b < 128) return result;
      scale *= 128;
    }
    throw new Error("varint too long");
  }

  zigzag(): number {
    const raw = this.varint();
    return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
  }

  float64(): number {
    if (this.remaining() < 8) throw new Error("truncated frame");
    const value = this.view.getFloat64(this.pos);
    this.pos += 8;
    return value;
  }

  string(): string {
    const length = this.varint();
    if (length > this.remaining()) throw new Error("truncated frame");
    const text = textDecoder.decode(this.bytes.subarray(this.pos, this.pos + length));
    this.pos += length;
    return text;
  }

  count(): number {
    const n = this.varint();
    if (n > this.remaining()) throw new Error("count exceeds frame");
    return n;
  }
}

function writeKey(out: Writer, key: string): void {
  const index = KEY_INDEX.get(key);
  if (index !== undefined) {
    out.varint(index);
    return;
  }
  out.varint(0);
  out.string(key);
}

function readKey(input: Reader): string {
  const index = input.varint();
  if (index === 0) return input.string();
  const key = KEY_DICTIONARY[index - 1];
  if (key === undefined) throw new Error("unknown key");
  return key;
}

function writeValue(out: Writer, value: unknown, depth: number): void {
  if (depth > MAX_DEPTH) throw new Error("value too deep");
  if (value === null || value === undefined) {
    out.byte(T_NULL);
  } else if (value === true) {
    out.byte(T_TRUE);
  } else if (value === false) {
    out.byte(T_FALSE);
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) out.byte(T_NULL);
    else if (Number.isInteger(value) && Math.abs(value) <= MAX_SAFE_INT && !Object.is(value, -0)) {
      out.byte(T_INT);
      out.zigzag(value);
    } else {
      out.byte(T_FLOAT);
      out.float64(value);
    }
  } else if (typeof value === "string") {
    out.byte(T_STRING);
    out.string(value);
  } else if (Array.isArray(value)) {
    out.byte(T_ARRAY);
    out.varint(value.length);
    for (const item of value) writeValue(out, item, depth + 1);
  } else if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined && typeof item !== "function");
    out.byte(T_OBJECT);
    out.varint(entries.length);
    for (const [key, item] of entries) {
      writeKey(out, key);
      writeValue(out, item, depth + 1);
    }
  } else {
    out.byte(T_NULL);
  }
}

function readValue(input: Reader, depth: number): unknown {
  if (depth > MAX_DEPTH) throw new Error("value too deep");
  const tag = input.byte();
  switch (tag) {
    case T_NULL:
      return null;
    case T_FALSE:
      return false;
    case T_TRUE:
      return true;
    case T_INT:
      return input.zigzag();
    case T_FLOAT:
      return input.float64();
    case T_STRING:
      return input.string();
    case T_ARRAY: {
      const length = input.count();
      const items: unknown[] = [];
      for (let i = 0; i < length; i += 1) items.push(readValue(input, depth + 1));
      return items;
    }
    case T_OBJECT: {
      const length = input.count();
      const object: Record<string, unknown> = {};
      for (let i = 0; i < length; i += 1) {
        const key = readKey(input);
        if (key === "__proto__") throw new Error("forbidden key");
        object[key] = readValue(input, depth + 1);
      }
      return object;
    }
    default:
      throw new Error("unknown tag");
  }
}

/** Quantisation applied to replicated poses on the binary wire, in decimal places. */
export type WirePrecision = {
  /** Decimal places kept for positions and velocities. Default 2 (centimetres). */
  position?: number | undefined;
  /** Decimal places kept for rotations. Default 3 (about a milliradian). */
  angle?: number | undefined;
};

/** Default {@link WirePrecision}. */
export const DEFAULT_WIRE_PRECISION = { position: 2, angle: 3 } as const;

const MAX_DECIMALS = 6;

function resolveDecimals(value: number | undefined, fallback: number, name: string): number {
  const decimals = value ?? fallback;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new RangeError(`${name} precision must be an integer from 0 to ${MAX_DECIMALS}`);
  }
  return decimals;
}

const NUMERIC_FIELDS = 9;
const REST_BIT = 1 << NUMERIC_FIELDS;
const ALL_BITS = (1 << (NUMERIC_FIELDS + 1)) - 1;
const ENTITY_NUMERIC_KEYS = new Set(["id", "position", "rotationY", "rotationX", "rotationZ", "velocity"]);

type EntityState = {
  numbers: readonly number[];
  rest: ReadonlyMap<string, string>;
  restValues: ReadonlyMap<string, unknown>;
  index: number;
};

const NO_VALUES: ReadonlyMap<string, unknown> = new Map();
const NO_JSON: ReadonlyMap<string, string> = new Map();

type WireEntity = {
  id: string;
  numbers: readonly number[];
  rest: Record<string, unknown>;
  restJson: ReadonlyMap<string, string>;
};

type Prepared = { positionScale: number; angleScale: number; entity: WireEntity | null };

/** Entities in one diff are shared by every connection's encoder, so each is quantised and fingerprinted once. */
const preparedEntities = new WeakMap<object, Prepared>();

function prepareEntity(value: unknown, positionScale: number, angleScale: number): WireEntity | null {
  if (typeof value !== "object" || value === null) return null;
  const cached = preparedEntities.get(value);
  if (cached !== undefined && cached.positionScale === positionScale && cached.angleScale === angleScale) {
    return cached.entity;
  }
  const entity = readWireEntity(value, positionScale, angleScale);
  preparedEntities.set(value, { positionScale, angleScale, entity });
  return entity;
}

function isVector3(value: unknown): value is readonly [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function quantise(v: number, scale: number): number {
  const q = Math.round(v * scale);
  return Math.abs(q) <= MAX_SAFE_INT ? q : 0;
}

/** Equality fingerprint for one field; only ever compared with another fingerprint, so primitives skip JSON. */
function fingerprint(item: unknown): string {
  if (typeof item === "string") return `s${item}`;
  if (typeof item === "number" || typeof item === "boolean") return `p${item}`;
  return JSON.stringify(item);
}

function readWireEntity(value: unknown, positionScale: number, angleScale: number): WireEntity | null {
  if (!isRecord(value)) return null;
  const id = value["id"];
  const position = value["position"];
  const velocity = value["velocity"];
  const rotationY = value["rotationY"];
  const rotationX = value["rotationX"];
  const rotationZ = value["rotationZ"];
  if (typeof id !== "string") return null;
  if (!isVector3(position) || !isVector3(velocity)) return null;
  if (typeof rotationY !== "number" || typeof rotationX !== "number" || typeof rotationZ !== "number") return null;
  if (![rotationY, rotationX, rotationZ].every(Number.isFinite)) return null;
  const [px, py, pz] = position;
  const [vx, vy, vz] = velocity;
  const numbers = [
    quantise(px, positionScale),
    quantise(py, positionScale),
    quantise(pz, positionScale),
    quantise(rotationY, angleScale),
    quantise(rotationX, angleScale),
    quantise(rotationZ, angleScale),
    quantise(vx, positionScale),
    quantise(vy, positionScale),
    quantise(vz, positionScale),
  ];
  const rest: Record<string, unknown> = {};
  const restJson = new Map<string, string>();
  for (const key in value) {
    if (!Object.hasOwn(value, key) || ENTITY_NUMERIC_KEYS.has(key)) continue;
    const item = value[key];
    if (item === undefined) continue;
    rest[key] = item;
    restJson.set(key, fingerprint(item));
  }
  return { id, numbers, rest, restJson };
}

function entityFromState(id: string, numbers: readonly number[], rest: ReadonlyMap<string, unknown>, positionScale: number, angleScale: number) {
  const n = (i: number, scale: number) => (numbers[i] ?? 0) / scale;
  return {
    ...Object.fromEntries(rest),
    id,
    position: [n(0, positionScale), n(1, positionScale), n(2, positionScale)],
    rotationY: n(3, angleScale),
    rotationX: n(4, angleScale),
    rotationZ: n(5, angleScale),
    velocity: [n(6, positionScale), n(7, positionScale), n(8, positionScale)],
  };
}

type ServerStream = {
  seq: number;
  states: Map<string, EntityState>;
  free: number[];
  next: number;
};

function newStream(): ServerStream {
  return { seq: 0, states: new Map(), free: [], next: 0 };
}

function allocate(stream: ServerStream): number {
  return stream.free.pop() ?? stream.next++;
}

function worldParts(message: unknown): {
  serverId: string;
  reset: boolean;
  entities: unknown[];
  removed: string[];
  envelope: Record<string, unknown>;
} | null {
  if (!isRecord(message) || message["t"] !== "update" || message["channel"] !== "server") return null;
  const serverId = message["serverId"];
  const data = message["data"];
  if (typeof serverId !== "string" || !isRecord(data)) return null;
  const frame = data["serverState"];
  if (!isRecord(frame)) return null;
  if (frame["kind"] === "baseline") {
    const snapshot = frame["snapshot"];
    if (!isRecord(snapshot) || !Array.isArray(snapshot["entities"])) return null;
    return {
      serverId,
      reset: true,
      entities: snapshot["entities"],
      removed: [],
      envelope: { ...message, data: { ...data, serverState: { ...frame, snapshot: { ...snapshot, entities: [] } } } },
    };
  }
  if (frame["kind"] === "diff") {
    const diff = frame["diff"];
    if (!isRecord(diff) || !Array.isArray(diff["entities"]) || !Array.isArray(diff["removedEntities"])) return null;
    const removed = diff["removedEntities"];
    if (!removed.every((id): id is string => typeof id === "string")) return null;
    return {
      serverId,
      reset: false,
      entities: diff["entities"],
      removed,
      envelope: { ...message, data: { ...data, serverState: { ...frame, diff: { ...diff, entities: [], removedEntities: [] } } } },
    };
  }
  return null;
}

/** Stateful binary encoder for one connection's outgoing messages. */
export type WireEncoder = { encode(message: unknown): Uint8Array<ArrayBuffer> };

/** Stateful binary decoder for one connection's incoming messages. */
export type WireDecoder = {
  /** The decoded message, `null` for a malformed frame, or `"desync"` when a world delta does not follow the last frame it saw (the receiver must resubscribe for a baseline). */
  decode(frame: Uint8Array): unknown;
};

/** Marks a binary frame the decoder could not apply to its state. */
export const WIRE_DESYNC = "desync" as const;

/**
 * Encoder for one connection. World frames (`update` on the `server` channel) go out as per-entity field
 * deltas against the previous world frame sent on that connection; everything else is a tagged value.
 * @internal
 */
export function createWireEncoder(precision: WirePrecision = {}): WireEncoder {
  const position = resolveDecimals(precision.position, DEFAULT_WIRE_PRECISION.position, "position");
  const angle = resolveDecimals(precision.angle, DEFAULT_WIRE_PRECISION.angle, "angle");
  const positionScale = 10 ** position;
  const angleScale = 10 ** angle;
  const streams = new Map<string, ServerStream>();

  function generic(message: unknown): Uint8Array<ArrayBuffer> {
    const out = new Writer();
    out.byte(WIRE_MAGIC);
    out.byte(KIND_GENERIC);
    writeValue(out, message, 0);
    return out.finish();
  }

  return {
    encode(message): Uint8Array<ArrayBuffer> {
      const parts = worldParts(message);
      if (parts === null) return generic(message);
      const wire: WireEntity[] = [];
      for (const raw of parts.entities) {
        const entity = prepareEntity(raw, positionScale, angleScale);
        if (entity === null) return generic(message);
        wire.push(entity);
      }
      let stream = streams.get(parts.serverId);
      if (parts.reset || stream === undefined) {
        stream = newStream();
        streams.set(parts.serverId, stream);
      } else {
        stream.seq += 1;
      }
      const section = new Writer();
      let written = 0;
      for (const entity of wire) {
        const state = stream.states.get(entity.id);
        let mask = 0;
        const base = state?.numbers;
        for (let i = 0; i < NUMERIC_FIELDS; i += 1) {
          if (base === undefined || base[i] !== entity.numbers[i]) mask |= 1 << i;
        }
        const changed: [string, string, unknown][] = [];
        const removedKeys: string[] = [];
        for (const [key, json] of entity.restJson) {
          if (state?.rest.get(key) !== json) changed.push([key, json, entity.rest[key]]);
        }
        if (state !== undefined) for (const key of state.rest.keys()) if (!entity.restJson.has(key)) removedKeys.push(key);
        if (state === undefined) mask = ALL_BITS;
        else if (changed.length > 0 || removedKeys.length > 0) mask |= REST_BIT;
        if (mask === 0) continue;
        written += 1;
        let index: number;
        if (state === undefined) {
          index = allocate(stream);
          section.varint(0);
          section.string(entity.id);
        } else {
          index = state.index;
          section.varint(index + 1);
        }
        section.varint(mask);
        for (let i = 0; i < NUMERIC_FIELDS; i += 1) {
          if ((mask & (1 << i)) !== 0) section.zigzag((entity.numbers[i] ?? 0) - (base?.[i] ?? 0));
        }
        if ((mask & REST_BIT) !== 0) {
          section.varint(changed.length);
          for (const [key, , item] of changed) {
            writeKey(section, key);
            writeValue(section, item, 1);
          }
          section.varint(removedKeys.length);
          for (const key of removedKeys) writeKey(section, key);
        }
        stream.states.set(entity.id, { numbers: entity.numbers, rest: entity.restJson, restValues: NO_VALUES, index });
      }
      const removals = new Writer();
      for (const id of parts.removed) {
        const state = stream.states.get(id);
        if (state === undefined) {
          removals.varint(0);
          removals.string(id);
        } else {
          removals.varint(state.index + 1);
          stream.free.push(state.index);
          stream.states.delete(id);
        }
      }
      const out = new Writer();
      out.byte(WIRE_MAGIC);
      out.byte(KIND_WORLD);
      out.byte(parts.reset ? 1 : 0);
      out.byte(position);
      out.byte(angle);
      out.varint(stream.seq);
      writeValue(out, parts.envelope, 0);
      out.varint(written);
      out.raw(section.view8());
      out.varint(parts.removed.length);
      out.raw(removals.view8());
      return out.finish();
    },
  };
}

/** Decoder for one connection; mirrors {@link createWireEncoder}'s per-stream state. @internal */
export function createWireDecoder(): WireDecoder {
  const streams = new Map<string, ServerStream & { ids: Map<number, string> }>();

  return {
    decode(frame) {
      try {
        const input = new Reader(frame);
        if (input.byte() !== WIRE_MAGIC) return null;
        const kind = input.byte();
        if (kind === KIND_GENERIC) {
          const value = readValue(input, 0);
          return input.remaining() === 0 ? value : null;
        }
        if (kind !== KIND_WORLD) return null;
        const reset = input.byte() === 1;
        const positionScale = 10 ** resolveDecimals(input.byte(), 0, "position");
        const angleScale = 10 ** resolveDecimals(input.byte(), 0, "angle");
        const seq = input.varint();
        const envelope = readValue(input, 0);
        const parts = worldPartsFromEnvelope(envelope);
        if (parts === null) return null;
        let stream = streams.get(parts.serverId);
        if (reset) {
          stream = { ...newStream(), ids: new Map() };
          streams.set(parts.serverId, stream);
        } else if (stream === undefined || seq !== stream.seq + 1) {
          return WIRE_DESYNC;
        } else {
          stream.seq = seq;
        }
        const live = stream;
        const count = input.count();
        const entities: unknown[] = [];
        for (let n = 0; n < count; n += 1) {
          const ref = input.varint();
          let id: string;
          let state: EntityState | undefined;
          if (ref === 0) {
            id = input.string();
            state = undefined;
          } else {
            const known = live.ids.get(ref - 1);
            if (known === undefined) return WIRE_DESYNC;
            id = known;
            state = live.states.get(id);
            if (state === undefined) return WIRE_DESYNC;
          }
          const mask = input.varint();
          if (mask > ALL_BITS) return null;
          const numbers = state === undefined ? new Array<number>(NUMERIC_FIELDS).fill(0) : [...state.numbers];
          for (let i = 0; i < NUMERIC_FIELDS; i += 1) {
            if ((mask & (1 << i)) !== 0) numbers[i] = (numbers[i] ?? 0) + input.zigzag();
          }
          const restValues = new Map<string, unknown>(state?.restValues ?? []);
          if ((mask & REST_BIT) !== 0) {
            const changed = input.count();
            for (let i = 0; i < changed; i += 1) {
              const key = readKey(input);
              restValues.set(key, readValue(input, 1));
            }
            const gone = input.count();
            for (let i = 0; i < gone; i += 1) restValues.delete(readKey(input));
          }
          let index = state?.index;
          if (index === undefined) {
            index = allocate(live);
            live.ids.set(index, id);
          }
          live.states.set(id, { numbers, rest: NO_JSON, restValues, index });
          entities.push(entityFromState(id, numbers, restValues, positionScale, angleScale));
        }
        const removedCount = input.count();
        const removed: string[] = [];
        for (let n = 0; n < removedCount; n += 1) {
          const ref = input.varint();
          if (ref === 0) {
            removed.push(input.string());
            continue;
          }
          const id = live.ids.get(ref - 1);
          if (id === undefined) return WIRE_DESYNC;
          removed.push(id);
          live.states.delete(id);
          live.ids.delete(ref - 1);
          live.free.push(ref - 1);
        }
        if (input.remaining() !== 0) return null;
        return fillEnvelope(parts.envelope, reset, entities, removed);
      } catch {
        return null;
      }
    },
  };
}

function worldPartsFromEnvelope(envelope: unknown): { serverId: string; envelope: Record<string, unknown> } | null {
  if (!isRecord(envelope)) return null;
  const serverId = envelope["serverId"];
  return typeof serverId === "string" ? { serverId, envelope } : null;
}

function fillEnvelope(
  envelope: Record<string, unknown>,
  reset: boolean,
  entities: unknown[],
  removed: string[],
): unknown {
  const data = envelope["data"];
  if (!isRecord(data)) return null;
  const frame = data["serverState"];
  if (!isRecord(frame)) return null;
  const target = reset ? frame["snapshot"] : frame["diff"];
  if (!isRecord(target)) return null;
  target["entities"] = entities;
  if (!reset) target["removedEntities"] = removed;
  return envelope;
}

/** Encode one message as a stateless tagged-value frame; used for client messages and any consumer that does not track world state. @internal */
export function encodeWireValue(message: unknown): Uint8Array<ArrayBuffer> {
  const out = new Writer();
  out.byte(WIRE_MAGIC);
  out.byte(KIND_GENERIC);
  writeValue(out, message, 0);
  return out.finish();
}

/** Decode a stateless tagged-value frame; `null` for anything else (world frames need a {@link WireDecoder}). @internal */
export function decodeWireValue(frame: Uint8Array): unknown {
  try {
    const input = new Reader(frame);
    if (input.byte() !== WIRE_MAGIC || input.byte() !== KIND_GENERIC) return null;
    const value = readValue(input, 0);
    return input.remaining() === 0 ? value : null;
  } catch {
    return null;
  }
}
