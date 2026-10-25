import type {
  WorldChanges,
  WorldConditions,
  WorldFactValue,
  WorldRippleDecl,
  WorldScheduleDecl,
  WorldTriggerDecl,
} from "./worldModel";

/** One contested block: a declared place whose `owner` and `grip` facts the war moves. */
export interface TurfBlockDecl {
  /** Blocks this one touches. A front pushes into a block only from a border block its side holds. */
  borders?: readonly string[];
}

/** One side's standing campaign: where it pushes, how often and how hard. */
export interface TurfFrontDecl {
  /** The side pushing. */
  by: string;
  /** Sides whose blocks it pushes into (default every other side). */
  into?: readonly string[];
  /** Seconds between pushes on each target (default 90); each further target and border adds 3 s so pushes never land together. */
  every?: number;
  /** Share of pushes that happen, 0-1 (default 1). */
  chance?: number;
  /** Grip one push takes off the block (default 15). */
  hit?: number;
  /** Only push while these facts hold, e.g. `{ "carmine.mood": { atMost: -20 } }`. */
  when?: WorldConditions;
  /** Push only from a border block the side holds (default true); false strikes any block it doesn't own. */
  fromBorders?: boolean;
  /** Log line per push; `{place}` is the block. */
  note?: string;
  /** Code hook (from the world's `options.hooks`) run per push, e.g. to put a crew on the corner. */
  hook?: string;
  /** Absolute changes each push applies, e.g. `{ "war.tension": 5 }`. */
  world?: WorldChanges;
}

/** A turf war between any number of sides over a set of blocks. */
export interface TurfWarDecl {
  blocks: Readonly<Record<string, TurfBlockDecl>>;
  /** Every side that can hold a block, the player included when it plays. */
  sides: readonly string[];
  /** Names for log lines, keyed by side (default the id). */
  labels?: Readonly<Record<string, string>>;
  /** Grip a block holds right after it changes hands (default 40). Grip facts need `min: 0`. */
  takenGrip?: number;
  /** Absolute changes when a side takes a block, keyed by the taker, e.g. `{ player: { "carmine.mood": -10 } }`. */
  onTake?: Readonly<Record<string, WorldChanges>>;
  /** Changes when a side loses a block, keyed by the loser. */
  onLose?: Readonly<Record<string, WorldChanges>>;
  /** Log line when a block changes hands; `{taker}`, `{loser}` and `{place}` are filled in, and a lowercase label opening the line is capitalised, so `labels: { player: "you", red: "the Reds" }` reads "You took..." and "The Reds took...". */
  note?: string;
  fronts?: Readonly<Record<string, TurfFrontDecl>>;
}

/** A block as a map, the phone or the news reads it. */
export interface TurfBlockView {
  id: string;
  owner: string;
  grip: number;
  /** The side that last pushed into the block, or `""`. */
  attacker: string;
  /** Someone other than the owner is pushing and the grip is under 30. */
  contested: boolean;
}

/** A block changing hands, read back from a fired trigger id. */
export interface TurfHandover {
  block: string;
  from: string;
  to: string;
}

/** The war expanded into world-model declarations, plus readers over the live world. */
export interface TurfWar {
  readonly decl: TurfWarDecl;
  /** One trigger per block, owner and taker: grip at 0 with that taker pushing hands the block over. */
  readonly triggers: Readonly<Record<string, WorldTriggerDecl>>;
  /** One push ripple per front, with a variant per side it pushes into. */
  readonly ripples: Readonly<Record<string, readonly WorldRippleDecl[]>>;
  /** One schedule per front, target block and border it pushes from. */
  readonly schedule: Readonly<Record<string, WorldScheduleDecl>>;
  /** Each block's `attacker` fact, starting empty. */
  readonly facts: Readonly<Record<string, WorldFactValue>>;
  /** The ripple kind a side's front fires, for a game event that counts as that front pushing. */
  pushRipple(front: string): string;
  /** The handover a fired trigger id stands for, or null when the id is not this war's. */
  handover(firedId: string): TurfHandover | null;
  /** Every block's owner, grip and attacker. */
  view(world: TurfWorldReader): TurfBlockView[];
  /** How many blocks a side holds. */
  held(world: TurfWorldReader, side: string): number;
}

/** The part of a world model the readers need. */
export interface TurfWorldReader {
  fact(key: string): WorldFactValue | undefined;
  num(key: string): number;
}

const TRIGGER = "turf:";
const PUSH = "turf_push:";
const STAGGER = 3;

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function fail(message: string): never {
  throw new RangeError(`turf war: ${message}`);
}

/**
 * Expand a turf war into the world model's own declarations: blocks change hands when a side's
 * pushes wear the grip to zero, each side's front pushes on its own clock from the blocks it holds,
 * and the world's log, ripples and hooks carry every push. Spread `triggers`, `ripples`, `schedule`
 * and `facts` into `defineWorldModel`; a game event (a soldier dropped on a corner) pushes by setting
 * the block's `attacker` along with its grip change.
 *
 * @capability turf-war blocks that change hands between any number of sides, with fronts that push on their own clock
 */
export function defineTurfWar(decl: TurfWarDecl): TurfWar {
  const sides = new Set(decl.sides);
  if (sides.size < 2) fail("needs at least two sides");
  if (sides.size !== decl.sides.length) fail("a side is listed twice");
  const blocks = Object.keys(decl.blocks);
  if (blocks.length === 0) fail("needs at least one block");
  for (const [id, block] of Object.entries(decl.blocks)) {
    if (id.includes(":")) fail(`block "${id}" may not contain ":"`);
    for (const border of block.borders ?? []) {
      if (border === id) fail(`block "${id}" borders itself`);
      if (decl.blocks[border] === undefined) fail(`block "${id}" borders unknown block "${border}"`);
    }
  }
  const label = (side: string) => decl.labels?.[side] ?? side;
  const takenGrip = decl.takenGrip ?? 40;
  const note = decl.note ?? "{taker} took {place} from {loser}.";

  const triggers: Record<string, WorldTriggerDecl> = {};
  const facts: Record<string, WorldFactValue> = {};
  for (const block of blocks) {
    facts[`${block}.attacker`] = "";
    for (const from of decl.sides) {
      for (const to of decl.sides) {
        if (from === to) continue;
        triggers[`${TRIGGER}${block}:${from}:${to}`] = {
          when: { [`${block}.owner`]: from, [`${block}.grip`]: { atMost: 0 }, [`${block}.attacker`]: to },
          then: {
            [`${block}.owner`]: to,
            [`${block}.grip`]: takenGrip,
            [`${block}.attacker`]: "",
            ...(decl.onTake?.[to] ?? {}),
            ...(decl.onLose?.[from] ?? {}),
          },
          place: block,
          note: sentence(note.replace("{taker}", label(to)).replace("{loser}", label(from))),
        };
      }
    }
  }

  const ripples: Record<string, WorldRippleDecl[]> = {};
  const schedule: Record<string, WorldScheduleDecl> = {};
  for (const [frontId, front] of Object.entries(decl.fronts ?? {})) {
    if (frontId.includes(":")) fail(`front "${frontId}" may not contain ":"`);
    if (!sides.has(front.by)) fail(`front "${frontId}" is pushed by unknown side "${front.by}"`);
    const into = front.into ?? decl.sides.filter((side) => side !== front.by);
    for (const side of into) {
      if (!sides.has(side)) fail(`front "${frontId}" pushes into unknown side "${side}"`);
      if (side === front.by) fail(`front "${frontId}" pushes into its own side`);
    }
    const every = front.every ?? 90;
    if (!(every > 0)) fail(`front "${frontId}" needs every > 0`);
    const hit = front.hit ?? 15;
    ripples[`${PUSH}${frontId}`] = into.map((side) => ({
      whenPlace: { owner: side },
      place: { grip: -hit, attacker: front.by },
      ...(front.world !== undefined ? { world: front.world } : {}),
      ...(front.note !== undefined ? { note: front.note } : {}),
      ...(front.hook !== undefined ? { hook: front.hook } : {}),
    }));
    let index = 0;
    const add = (block: string, from: string | null) => {
      const when: Record<string, WorldConditions[string]> = { ...(front.when ?? {}), [`${block}.owner`]: { is: front.by, not: true } };
      if (from !== null) when[`${from}.owner`] = front.by;
      schedule[`${PUSH}${frontId}:${block}${from === null ? "" : `:${from}`}`] = {
        every: every + STAGGER * index,
        ripple: `${PUSH}${frontId}`,
        place: block,
        ...(front.chance !== undefined ? { chance: front.chance } : {}),
        when,
      };
      index += 1;
    };
    for (const block of blocks) {
      if (front.fromBorders === false) add(block, null);
      else for (const border of decl.blocks[block]?.borders ?? []) add(block, border);
    }
  }

  const ownerOf = (world: TurfWorldReader, block: string) => {
    const owner = world.fact(`${block}.owner`);
    return typeof owner === "string" ? owner : "";
  };

  return {
    decl,
    triggers,
    ripples,
    schedule,
    facts,
    pushRipple: (front) => {
      if (decl.fronts?.[front] === undefined) fail(`unknown front "${front}"`);
      return `${PUSH}${front}`;
    },
    handover(firedId) {
      if (!firedId.startsWith(TRIGGER)) return null;
      const [block, from, to] = firedId.slice(TRIGGER.length).split(":");
      if (block === undefined || from === undefined || to === undefined || decl.blocks[block] === undefined) return null;
      return { block, from, to };
    },
    view: (world) =>
      blocks.map((id) => {
        const owner = ownerOf(world, id);
        const attacker = world.fact(`${id}.attacker`);
        const pusher = typeof attacker === "string" ? attacker : "";
        const grip = world.num(`${id}.grip`);
        return { id, owner, grip, attacker: pusher, contested: pusher !== "" && pusher !== owner && grip < 30 };
      }),
    held: (world, side) => blocks.filter((id) => ownerOf(world, id) === side).length,
  };
}
