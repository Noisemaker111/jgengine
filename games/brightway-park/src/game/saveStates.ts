import { createHeadlessRunner } from "@jgengine/core/runtime/headlessRunner";

import { game } from "../game.config";
import { GUEST_KINDS } from "./entities/guests/catalog";
import { guestAgentState } from "./agents";
import { MILESTONES } from "./milestones";
import { decodeSave, snapshotPark, type ParkSave } from "./persistence";
import { content } from "./content";
import { GUEST_PHASES, type GuestPhase, type GuestState } from "./session";
import type { SaveStateAxis, SaveStateGate } from "../../../shared/saveStates";

/**
 * Every value a park save can hold, for the gate in `shared/saveStates.ts`: each axis' values come
 * from the game's own list, so the gate cannot drift from the decoder the way the guest phase list
 * did. A park saved while a guest was queued or riding is a legal state and must load.
 */

const TICKET_MIN = 4;
const TICKET_MAX = 60;
const FAR_FUTURE = 1_000_000_000;

/** The base save: a park this build started and saved, with no guests or scenario in it. */
function base(): string {
  const runner = createHeadlessRunner({ definition: game.game, content, loop: game.game.loop, maxStepSeconds: 1 });
  runner.ui.invoke("park.start");
  return JSON.stringify(snapshotPark(runner.ctx));
}

function parse(raw: string): ParkSave {
  return JSON.parse(raw) as ParkSave;
}

/** One world fact set to the axis value. */
function withFact(key: string): (value: unknown, raw: string) => string {
  return (value, raw) => {
    const save = parse(raw);
    save.world.facts[key] = value as number | string;
    return JSON.stringify(save);
  };
}

const fact = (key: string) => (save: unknown) => (save as ParkSave).world.facts[key];

/** One guest in the save, in the state the axis asks for. */
function withGuest(edit: (state: GuestState) => void): (base: string) => string {
  return (raw) => {
    const save = parse(raw);
    const state: GuestState = {
      id: "guest#1",
      kind: GUEST_KINDS[0]!,
      money: 40,
      visits: 0,
      phase: "seeking",
      targetId: null,
      target: null,
      targetUntil: 0,
      busy: 0,
      agent: guestAgentState("guest#1", GUEST_KINDS[0]!, { fun: 50, hunger: 50, thirst: 50, energy: 90, souvenir: 100 }),
    };
    edit(state);
    save.guests = [{ state, position: [0, 0, 58] }];
    return JSON.stringify(save);
  };
}

const axes: SaveStateAxis[] = [
  {
    field: "guests[].state.phase",
    values: GUEST_PHASES satisfies readonly GuestPhase[],
    encode: (value, raw) => withGuest((state) => { state.phase = value as GuestPhase; })(raw),
    decode: decodeSave,
    read: (save) => (save as ParkSave).guests[0]?.state.phase,
  },
  {
    field: "guests[].state.kind",
    values: GUEST_KINDS,
    encode: (value, raw) => withGuest((state) => { state.kind = value as string; })(raw),
    decode: decodeSave,
    read: (save) => (save as ParkSave).guests[0]?.state.kind,
  },
  // A milestone is open when the park's best rating reached it: every milestone's rating must load.
  {
    field: "world.facts.park.peak",
    values: MILESTONES.map((milestone) => milestone.rating),
    encode: withFact("park.peak"),
    decode: decodeSave,
    read: fact("park.peak"),
  },
  {
    field: "world.facts.scenario.result",
    values: ["won", "failed"],
    encode: withFact("scenario.result"),
    decode: decodeSave,
    read: fact("scenario.result"),
  },
  // Extreme but legal numbers: the decoder's own bounds, at the edge, must load unchanged.
  {
    field: "world.facts.park.ticket",
    values: [TICKET_MIN, TICKET_MAX],
    encode: withFact("park.ticket"),
    decode: decodeSave,
    read: fact("park.ticket"),
  },
  {
    field: "clock.now",
    values: [0, FAR_FUTURE],
    encode: (value, raw) => {
      const save = parse(raw);
      save.clock.now = value as number;
      return JSON.stringify(save);
    },
    decode: decodeSave,
    read: (save) => (save as ParkSave).clock.now,
  },
  {
    field: "world.facts.park.cash",
    values: [0, -1_000_000, 1_000_000_000],
    encode: withFact("park.cash"),
    decode: decodeSave,
    read: fact("park.cash"),
  },
];

export const parkSaveStates: SaveStateGate = { game: "brightway-park", base, axes };
