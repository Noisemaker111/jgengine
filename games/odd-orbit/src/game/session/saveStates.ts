import { createGameContext } from "@jgengine/core/runtime/gameContext";

import type { SaveStateAxis, SaveStateGate } from "../../../../shared/saveStates";
import { game } from "../../game.config";
import { content } from "../content";
import { JOBS } from "../entities/aliens/catalog";
import { setupWorld } from "../sim/setup";
import { captureOrbitSave, validOrbitSave, type OrbitSave } from "./save";
import { BLOOM_CROPS, LIFESTYLES } from "./types";

/**
 * Every value a household save can hold, for the gate in `shared/saveStates.ts`. The values are the
 * game's own lists; this module only knows where each field sits in the save, so the gate cannot
 * drift from the decoder the way a hand-copied list does.
 */

function base(): string {
  const ctx = createGameContext({ definition: game.game, content, player: { userId: "orbit-save-states", isNew: true } });
  setupWorld(ctx);
  return JSON.stringify(captureOrbitSave(ctx));
}

function parse(raw: string): OrbitSave {
  return JSON.parse(raw) as OrbitSave;
}

/** The first member of the household, in the state the axis asks for. */
function withMember(edit: (member: OrbitSave["household"]["members"][string]) => void): (base: string) => string {
  return (raw) => {
    const save = parse(raw);
    const id = save.household.order[0]!;
    edit(save.household.members[id]!);
    return JSON.stringify(save);
  };
}

const axes: SaveStateAxis[] = [
  {
    field: "household.members[].lifestyle",
    values: LIFESTYLES,
    encode: (value, raw) => withMember((member) => { member.lifestyle = value as typeof LIFESTYLES[number]; })(raw),
    decode: (raw) => {
      const save = JSON.parse(raw) as OrbitSave;
      return validOrbitSave(save) ? save : null;
    },
    read: (save) => (save as OrbitSave).household.members[(save as OrbitSave).household.order[0]!]?.lifestyle,
  },
  {
    field: "household.members[].bloomCrop",
    values: BLOOM_CROPS,
    encode: (value, raw) => withMember((member) => { member.bloomCrop = value as typeof BLOOM_CROPS[number]; })(raw),
    decode: (raw) => {
      const save = JSON.parse(raw) as OrbitSave;
      return validOrbitSave(save) ? save : null;
    },
    read: (save) => (save as OrbitSave).household.members[(save as OrbitSave).household.order[0]!]?.bloomCrop,
  },
  {
    field: "household.members[].job",
    values: JOBS,
    encode: (value, raw) => withMember((member) => { member.job = value as string; })(raw),
    decode: (raw) => {
      const save = JSON.parse(raw) as OrbitSave;
      return validOrbitSave(save) ? save : null;
    },
    read: (save) => (save as OrbitSave).household.members[(save as OrbitSave).household.order[0]!]?.job,
  },
  {
    field: "household.credits",
    // Extreme but legal: the decoder's own ceiling, which must load unchanged.
    values: [0, 1_000_000],
    encode: (value, raw) => {
      const save = parse(raw);
      save.household.credits = value as number;
      return JSON.stringify(save);
    },
    decode: (raw) => {
      const save = JSON.parse(raw) as OrbitSave;
      return validOrbitSave(save) ? save : null;
    },
    read: (save) => (save as OrbitSave).household.credits,
  },
];

export const orbitSaveStates: SaveStateGate = { game: "odd-orbit", base, axes };
