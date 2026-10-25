import { defineGameSpec } from "@jgengine/core/worldModel/gameSpec";
import { calm, type WorldActionDecl, type WorldChanges, type WorldJobDecl, type WorldModelDecl } from "@jgengine/core/worldModel/worldModel";

import { editorLayers } from "../editorLayers";
import { idea } from "./idea";
import type { StructureWord } from "./kindShape";
import { campGrid, herdMarkers, nodeMarkers } from "./places";
import { onDawn, onFallen, onVictory, repairTarget, spawnWave, tameTarget } from "./waves";

/** `camp.<id>` - every resource, wave and count the game keeps lives in the camp faction. */
export const fact = (name: string) => `camp.${name}`;

const spend = (cost: Readonly<Record<string, number>>): WorldChanges =>
  Object.fromEntries(Object.entries(cost).map(([id, amount]) => [fact(id), -amount]));

const structureKinds = Object.fromEntries(
  idea.structures.map((structure: StructureWord) => [
    structure.id,
    {
      label: structure.label,
      tags: ["structure", structure.role],
      grid: "camp",
      cost: spend(structure.cost),
      takes: structure.takes,
      refund: 0.5,
      ...(structure.role === "turret" ? { limit: 8 } : {}),
      facts: { level: 1 },
    },
  ]),
);

const gatherActions: Record<string, WorldActionDecl> = Object.fromEntries(
  idea.nodes.map((node) => [
    `gather_${node.id}`,
    {
      label: node.verb,
      on: node.id,
      whenTarget: { left: { atLeast: 1 } },
      effect: { left: -1 },
      world: { [fact(node.gives)]: node.amount },
      refuse: `Picked clean - the ${node.label.toLowerCase()} refills soon`,
    },
  ]),
);

const tameActions: Record<string, WorldActionDecl> = Object.fromEntries(
  idea.allies.map((ally) => [
    `tame_${ally.id}`,
    { label: ally.verb, on: ally.id, whenTarget: { tame: false }, cost: spend(ally.cost), effect: { tame: true }, hook: "tamed", note: `A ${ally.label.toLowerCase()} joins the camp.`, refuse: "Already yours" },
  ]),
);

const [main] = idea.resources;
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
      ...(index === idea.beats.length - 1 ? { hook: "victory" } : {}),
      mission: {
        id: beat.id,
        title: beat.title,
        objectives: [{ id: `${beat.id}-goal`, kind: "survive", actor: "player", label: beat.goal, until: { fact: beat.fact, atLeast: beat.atLeast } }],
      },
    } satisfies WorldJobDecl,
  ]),
);

/** The whole camp as data: what it holds, what can be built, gathered and tamed, and when waves come. */
export const world: WorldModelDecl = {
  factions: {
    camp: {
      label: idea.home.label,
      facts: {
        ...Object.fromEntries(idea.resources.map((resource) => [resource.id, { value: resource.start, min: 0, max: 100000 }])),
        wave: 0,
        held: 0,
        alive: 0,
        tamed: 0,
        raiding: false,
        fallen: false,
        won: false,
        dusk_in: calm(idea.calm, 1, { rest: 0, max: 100000 }),
      },
    },
  },
  people: { guide: { name: idea.guide.name, faction: "camp", known: true, says: [{ text: idea.pitch }] } },
  things: {
    ...Object.fromEntries(
      nodeMarkers(editorLayers).map((marker) => {
        const node = idea.nodes.find((entry) => entry.id === marker.node)!;
        return [marker.id, { label: node.label, kind: node.id, facts: { left: calm(node.uses, node.regrow, { max: node.uses }) } }];
      }),
    ),
    ...Object.fromEntries(
      herdMarkers(editorLayers).map((marker) => {
        const ally = idea.allies.find((entry) => entry.id === marker.ally)!;
        return [marker.id, { label: ally.label, kind: ally.id, facts: { tame: false } }];
      }),
    ),
  },
  grids: { camp: campGrid(editorLayers) },
  kinds: structureKinds,
  actions: {
    ...gatherActions,
    ...tameActions,
    upgrade: { label: "Upgrade", on: "structure", whenTarget: { level: { atMost: 2 } }, cost: { [fact(main!.id)]: -12 }, scaleBy: "level", effect: { level: 1 }, note: "{target} upgraded.", refuse: "Already at its best" },
    repair: { label: "Repair", on: "structure", cost: { [fact(main!.id)]: -4 }, hook: "repair" },
    sell: { label: "Tear down", on: "structure", removes: true, note: "{target} torn down." },
  },
  totals: {
    [fact("walls")]: { of: "wall" },
    [fact("turrets")]: { of: "turret" },
    [fact("built")]: { of: "structure" },
    ...Object.fromEntries(
      idea.structures.filter((structure) => structure.role === "producer").map((structure) => [fact(`works_${structure.id}`), { of: structure.id, sum: "level" }]),
    ),
  },
  flows: Object.fromEntries(
    idea.structures
      .filter((structure) => structure.role === "producer" && structure.makes !== undefined)
      .map((structure) => [`${structure.id}_output`, { to: fact(structure.makes!), rate: structure.power, from: fact(`works_${structure.id}`), when: { [fact("fallen")]: false } }]),
  ),
  queues: { build: { lanes: 2 } },
  schedule: {
    dusk: { every: 1, ripple: "dusk", when: { [fact("dusk_in")]: { atMost: 0 }, [fact("raiding")]: false, [fact("fallen")]: false } },
  },
  ripples: {
    dusk: { world: { [fact("wave")]: 1, [fact("raiding")]: true }, note: `${idea.wave} falls.`, hook: "wave" },
    dawn: {
      world: { [fact("held")]: 1, [fact("raiding")]: false, [fact("dusk_in")]: idea.calm, [fact(main!.id)]: 10 },
      note: `The ${idea.wave.toLowerCase()} is held.`,
      hook: "dawn",
    },
    breach: { world: { [fact("fallen")]: true }, note: `${idea.home.label} has fallen.`, hook: "fallen" },
  },
  jobs,
};

/**
 * The running camp: the declaration above plus the code it names. Built structures stand in the
 * scene under their instance ids (the engine spawns, removes and rebuilds them after a load), and
 * the story beats play straight through.
 */
export const camp = defineGameSpec({
  id: idea.spec,
  world,
  hooks: { wave: spawnWave, dawn: onDawn, fallen: onFallen, victory: onVictory, repair: repairTarget, tamed: tameTarget },
  show: { structure: { role: "prop" } },
  autoStart: true,
  accepting: (ctx) => (camp.of(ctx).fact(fact("fallen")) === true ? `${idea.home.label} has fallen` : null),
  input: (ctx) => ({ actors: { player: { alive: ctx.scene.entity.get(ctx.player.userId) !== null } } }),
});
