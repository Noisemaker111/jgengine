import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import type { WorldChanges, WorldJobDecl, WorldKindDecl, WorldModelDecl } from "@jgengine/core/worldModel/worldModel";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import type { StructureWord } from "./kindShape";
import { onBuilt, onCrowned, onFallen } from "./hooks";
import { colonyGrid } from "./places";

/** `colony.<id>` - every resource, count and flag the colony keeps lives in the colony faction. */
export const fact = (name: string) => `colony.${name}`;

const [food] = idea.resources;
const spend = (cost: Readonly<Record<string, number>>): WorldChanges => Object.fromEntries(Object.entries(cost).map(([id, amount]) => [fact(id), -amount]));

const TAGS: Record<StructureWord["role"], string[]> = {
  house: ["home", "structure"],
  store: ["store", "structure"],
  farm: ["farm", "structure"],
  tower: ["tower", "structure"],
  crown: ["crown"],
};

function kindOf(structure: StructureWord): WorldKindDecl {
  return {
    label: structure.label,
    tags: TAGS[structure.role],
    grid: "colony",
    size: structure.size,
    cost: spend(structure.cost),
    takes: structure.takes,
    refund: 0.5,
    facts: { level: 1, ...(structure.beds === undefined ? {} : { beds: structure.beds }) },
    hook: structure.role === "crown" ? "crowned" : "built",
    ...(structure.role === "crown" ? { limit: 1 } : {}),
  };
}

const farms = idea.structures.filter((structure) => structure.role === "farm");

const jobs: Record<string, WorldJobDecl> = Object.fromEntries(
  idea.beats.map((beat, index) => [
    beat.id,
    {
      title: beat.title,
      kind: "story",
      act: index + 1,
      giver: "guide",
      pitch: beat.pitch,
      ...(index > 0 ? { requires: [idea.beats[index - 1]!.id] } : {}),
      mission: {
        id: beat.id,
        title: beat.title,
        objectives: [{ id: `${beat.id}-goal`, kind: "survive", actor: "player", label: beat.goal, until: { fact: beat.fact, atLeast: beat.atLeast } }],
      },
    } satisfies WorldJobDecl,
  ]),
);

/** The whole colony as data: its stores, what can be built, what farms grow, what everyone eats. */
export const world: WorldModelDecl = {
  factions: {
    colony: {
      label: idea.name,
      facts: {
        ...Object.fromEntries(idea.resources.map((resource) => [resource.id, { value: resource.start, min: 0, max: 1000000 }])),
        // Colonists alive (the code keeps it), raids beaten off, seconds to the next raid.
        people: idea.colonists.start,
        raids: 0,
        raid_in: idea.raiders.first,
        raiding: false,
        gathered: 0,
        won: false,
        lost: false,
      },
    },
  },
  people: { guide: { name: idea.guide.name, faction: "colony", known: true, says: [{ text: idea.pitch }] } },
  grids: { colony: colonyGrid(editorLayers) },
  kinds: {
    hq: { label: idea.hq.label, tags: ["home", "store", "hq"], grid: "colony", size: idea.hq.size, facts: { level: 1, beds: idea.hq.beds }, limit: 1 },
    ...Object.fromEntries(idea.structures.map((structure) => [structure.id, kindOf(structure)])),
  },
  actions: {
    demolish: { label: "Demolish", on: "structure", removes: true, note: "{target} torn down." },
  },
  totals: {
    [fact("beds")]: { of: "home", sum: "beds" },
    [fact("homes")]: { of: "home" },
    [fact("structures")]: { of: "structure" },
    [fact("crowns")]: { of: "crown" },
    ...Object.fromEntries(farms.map((farm) => [fact(`works_${farm.id}`), { of: farm.id, sum: "level" }])),
  },
  flows: {
    eating: { to: fact(food!.id), rate: -idea.eats, from: fact("people") },
    ...Object.fromEntries(farms.map((farm) => [`${farm.id}_growing`, { to: fact(food!.id), rate: farm.rate ?? 0.3, from: fact(`works_${farm.id}`) }])),
  },
  triggers: {
    hungry: { when: { [fact(food!.id)]: { atMost: 0 } }, note: `Out of ${food!.label.toLowerCase()}: ${idea.colonists.label.toLowerCase()} are starving.` },
    fallen: { when: { [fact("people")]: { atMost: 0 } }, hook: "fallen", once: true },
  },
  queues: { build: { lanes: 2 } },
  jobs,
};

/**
 * The running colony: the declaration above plus the code it names. Built things stand in the scene
 * under their instance ids (the engine spawns, removes and rebuilds them after a load); the story
 * beats play straight through.
 */
export const colony = defineGameSpec({
  id: idea.spec,
  world,
  hooks: { crowned: onCrowned, fallen: onFallen, built: onBuilt },
  show: { hq: true, structure: true, crown: true },
  autoStart: true,
});
