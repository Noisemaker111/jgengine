import type {
  WorldChanges,
  WorldConditions,
  WorldFactValue,
  WorldRippleDecl,
  WorldScheduleDecl,
  WorldTriggerDecl,
} from "./worldModel";

export interface TurfBlockDecl {
  borders?: readonly string[];
}

export interface TurfFrontDecl {
  by: string;
  into?: readonly string[];
  /** Seconds between pushes on each target (default 90); each further target and border adds 3 s so pushes never land together. */
  every?: number;
  /** Share of pushes that happen, 0-1 (default 1). */
  chance?: number;
  hit?: number;
  when?: WorldConditions;
  fromBorders?: boolean;
  note?: string;
  hook?: string;
  world?: WorldChanges;
}

export interface TurfWarDecl {
  blocks: Readonly<Record<string, TurfBlockDecl>>;
  sides: readonly string[];
  labels?: Readonly<Record<string, string>>;
  takenGrip?: number;
  contestedGrip: number;
  onTake?: Readonly<Record<string, WorldChanges>>;
  onLose?: Readonly<Record<string, WorldChanges>>;
  note?: string;
  fronts?: Readonly<Record<string, TurfFrontDecl>>;
}

export interface TurfBlockView {
  id: string;
  owner: string;
  grip: number;
  attacker: string;
  contested: boolean;
}

export interface TurfHandover {
  block: string;
  from: string;
  to: string;
}

export interface TurfWar {
  readonly decl: TurfWarDecl;
  readonly triggers: Readonly<Record<string, WorldTriggerDecl>>;
  readonly ripples: Readonly<Record<string, readonly WorldRippleDecl[]>>;
  readonly schedule: Readonly<Record<string, WorldScheduleDecl>>;
  readonly facts: Readonly<Record<string, WorldFactValue>>;
  pushRipple(front: string): string;
  /** The handover a fired trigger id stands for, or null when the id is not this war's. */
  handover(firedId: string): TurfHandover | null;
  view(world: TurfWorldReader): TurfBlockView[];
  held(world: TurfWorldReader, side: string): number;
}

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

/** @capability turf-war blocks that change hands between any number of sides, with fronts that push on their own clock */
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
        return { id, owner, grip, attacker: pusher, contested: pusher !== "" && pusher !== owner && grip < decl.contestedGrip };
      }),
    held: (world, side) => blocks.filter((id) => ownerOf(world, id) === side).length,
  };
}
