/** Node flag: the branch is dead wood still attached. */
export const NODE_DEAD = 1;
/** Node flag: first internode of a lateral axis (a branch base). */
export const NODE_AXIS_START = 2;
/** Node flag: a shed branch left a scar at this node's tip. */
export const NODE_SCAR = 4;
/** Node flag: the short shoots on this node died in shade and bear no more leaves. */
export const NODE_NO_SPUR = 8;

/**
 * The whole simulation state as struct-of-arrays. Nodes are annual shoots (later merged into longer
 * bare segments) kept in creation order, so a
 * parent always sits before its children: a reverse loop is a basipetal pass, a forward loop acropetal.
 */
export interface GrowthState {
  nodeCap: number;
  budCap: number;
  nodeCount: number;
  budCount: number;
  nextNodeId: number;
  nextBudId: number;
  year: number;
  /** Carbohydrate reserve carried between years, kg dry mass. */
  reserveKg: number;
  /** Consecutive years the tree could not pay its upkeep. */
  stressYears: number;
  alive: number;
  health: number;
  /** Dead wood shed so far, kg dry mass. */
  shedKg: number;
  nodeId: Uint32Array;
  parent: Int32Array;
  born: Uint16Array;
  /**
   * Year the node's leaf cohort flushed. Equal to `born` for a fresh shoot; when merging or folding
   * pools two cohorts it becomes their leaf-weighted mean, so leaves keep their own age.
   */
  leafBorn: Uint16Array;
  order: Uint8Array;
  flags: Uint8Array;
  length: Float32Array;
  /** Unit growth direction, 3 per node. */
  dir: Float32Array;
  /** Tip position, 3 per node; the start is the parent's tip (the origin for the root). */
  end: Float32Array;
  /** Azimuth of this node's first lateral bud around its axis, radians. */
  phase: Float32Array;
  sapArea: Float32Array;
  heartArea: Float32Array;
  /** Leaf area on the node this year, m². */
  foliage: Float32Array;
  /** Metamers (leaf-bearing nodes) the annual shoot was born with. */
  metamers: Uint8Array;
  latent: Uint8Array;
  latentAge: Uint8Array;
  light: Float32Array;
  vigour: Float32Array;
  /** Bending moment at the node base last year, N·m. */
  moment: Float32Array;
  deficit: Uint8Array;
  deadAge: Uint8Array;
  flowers: Uint16Array;
  budId: Uint32Array;
  budNode: Int32Array;
  /** Years the bud has idled: shaded, or a lateral losing the contest for scarce bud slots. */
  budIdle: Uint8Array;
}

/** Typed-array fields of {@link GrowthState}, in snapshot order. */
export const NODE_FIELDS = [
  "nodeId", "parent", "born", "leafBorn", "order", "flags", "length", "dir", "end", "phase", "sapArea", "heartArea", "foliage", "metamers",
  "latent", "latentAge", "light", "vigour", "moment", "deficit", "deadAge", "flowers",
] as const;
/**
 * Typed-array bud fields of {@link GrowthState}, in snapshot order.
 * @internal
 */
export const BUD_FIELDS = ["budId", "budNode", "budIdle"] as const;
const VECTOR_FIELDS: ReadonlySet<string> = new Set(["dir", "end"]);

/**
 * Name of one typed-array field of {@link GrowthState}.
 * @internal
 */
export type GrowthArrayField = (typeof NODE_FIELDS)[number] | (typeof BUD_FIELDS)[number];

/**
 * Values per row of an array field (3 for vectors).
 * @internal
 */
export function fieldWidth(field: GrowthArrayField): number {
  return VECTOR_FIELDS.has(field) ? 3 : 1;
}

/**
 * Empty state with room for `nodeCap` nodes and `budCap` buds.
 * @internal
 */
export function createGrowthState(nodeCap: number, budCap: number): GrowthState {
  return {
    nodeCap,
    budCap,
    nodeCount: 0,
    budCount: 0,
    nextNodeId: 0,
    nextBudId: 0,
    year: 0,
    reserveKg: 0,
    stressYears: 0,
    alive: 1,
    health: 1,
    shedKg: 0,
    nodeId: new Uint32Array(nodeCap),
    parent: new Int32Array(nodeCap),
    born: new Uint16Array(nodeCap),
    leafBorn: new Uint16Array(nodeCap),
    order: new Uint8Array(nodeCap),
    flags: new Uint8Array(nodeCap),
    length: new Float32Array(nodeCap),
    dir: new Float32Array(nodeCap * 3),
    end: new Float32Array(nodeCap * 3),
    phase: new Float32Array(nodeCap),
    sapArea: new Float32Array(nodeCap),
    heartArea: new Float32Array(nodeCap),
    foliage: new Float32Array(nodeCap),
    metamers: new Uint8Array(nodeCap),
    latent: new Uint8Array(nodeCap),
    latentAge: new Uint8Array(nodeCap),
    light: new Float32Array(nodeCap),
    vigour: new Float32Array(nodeCap),
    moment: new Float32Array(nodeCap),
    deficit: new Uint8Array(nodeCap),
    deadAge: new Uint8Array(nodeCap),
    flowers: new Uint16Array(nodeCap),
    budId: new Uint32Array(budCap),
    budNode: new Int32Array(budCap),
    budIdle: new Uint8Array(budCap),
  };
}

/** Scalar fields of {@link GrowthState} carried in a snapshot. */
export const SCALAR_FIELDS = [
  "nodeCount", "budCount", "nextNodeId", "nextBudId", "year", "reserveKg", "stressYears", "alive", "health", "shedKg",
] as const;

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Bytes to base64 without platform helpers, so the model layer stays runtime-free.
 * @internal
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64.charAt(n >>> 18) + BASE64.charAt((n >>> 12) & 63) + BASE64.charAt((n >>> 6) & 63) + BASE64.charAt(n & 63);
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16;
    out += BASE64.charAt(n >>> 18) + BASE64.charAt((n >>> 12) & 63) + "==";
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += BASE64.charAt(n >>> 18) + BASE64.charAt((n >>> 12) & 63) + BASE64.charAt((n >>> 6) & 63) + "=";
  }
  return out;
}

/**
 * Inverse of {@link bytesToBase64}.
 * @internal
 */
export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bitCount = 0;
  let at = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const value = BASE64.indexOf(clean.charAt(i));
    if (value < 0) throw new Error(`plant snapshot: invalid base64 at ${i}`);
    buffer = (buffer << 6) | value;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[at] = (buffer >>> bitCount) & 0xff;
      at += 1;
    }
  }
  return bytes;
}
