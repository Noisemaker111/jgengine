import type { BodyFeatures, BodyPlan, MachineStyle } from "../../engine-local/creatureBody/bodyPlan";
import { BOTS, TEMPERAMENT_GLOW } from "./bots";

/**
 * Every machine's body, built in code: no free model of a feral forklift-giraffe exists, so each species is
 * a body plan drawn as a robot (panelled hulls, pistons, glowing eyes, antennae, rotors, drills) at its
 * standing height. Eye glow follows temperament (bots.ts), so a technician reads a machine's intent from
 * across a field. Proportions are what matter; the engine scales each to `height`.
 */
export interface RobotBody {
  plan: BodyPlan;
  /** Standing height in metres. */
  height: number;
}

type Head = [length: number, height: number, width: number, snout?: number];
interface Look {
  body: string;
  accent: string;
  belly?: string;
  features?: BodyFeatures;
  machine?: Omit<MachineStyle, "glow">;
  glow?: string;
}

const head = ([length, height, width, snout]: Head): BodyPlan["head"] => ({ length, height, width, ...(snout === undefined ? {} : { snout }) });
const colors = (look: Look) => ({ body: look.body, accent: look.accent, ...(look.belly === undefined ? {} : { belly: look.belly }) });
const style = (species: string, look: Look): MachineStyle => ({
  glow: look.glow ?? TEMPERAMENT_GLOW[BOTS[species]?.temperament ?? "aggressive"],
  ...look.machine,
});

/** Four legs: torso [length, height, width], legs [length, thickness]. */
function quad(species: string, torso: [number, number, number], legs: [number, number], h: Head, look: Look, extra: Partial<BodyPlan> = {}): BodyPlan {
  return {
    torso: { length: torso[0], height: torso[1], width: torso[2] },
    legs: { pairs: 2, length: legs[0], thickness: legs[1] },
    head: head(h),
    tail: { length: torso[0] * 0.5, thickness: torso[1] * 0.18, segments: 3 },
    ...(look.features === undefined ? {} : { features: look.features }),
    machine: style(species, look),
    colors: colors(look),
    ...extra,
  };
}

/** Two legs carrying it, a short pair of arms in front. */
function biped(species: string, torso: [number, number, number], legs: [number, number], h: Head, look: Look, extra: Partial<BodyPlan> = {}): BodyPlan {
  return {
    torso: { length: torso[0], height: torso[1], width: torso[2] },
    legs: { pairs: 2, length: legs[0], thickness: legs[1], biped: true, armScale: 0.45 },
    neck: { length: torso[1] * 0.6, thickness: torso[1] * 0.18, rise: 35 },
    head: head(h),
    tail: { length: torso[0] * 1.1, thickness: torso[1] * 0.2, segments: 4, droop: 0.05 },
    ...(look.features === undefined ? {} : { features: look.features }),
    machine: style(species, look),
    colors: colors(look),
    ...extra,
  };
}

/** Splayed legs in pairs: spider drones, beetles, crawlers. */
function bug(species: string, pairs: 3 | 4, torso: [number, number, number], legs: [number, number], h: Head, look: Look, extra: Partial<BodyPlan> = {}): BodyPlan {
  return {
    torso: { length: torso[0], height: torso[1], width: torso[2] },
    legs: { pairs, length: legs[0], thickness: legs[1] },
    head: head(h),
    ...(look.features === undefined ? {} : { features: look.features }),
    machine: style(species, { ...look, machine: { boxy: false, ...look.machine } }),
    colors: colors(look),
    ...extra,
  };
}

/** A legless chain of segments: eels, cable snakes, leech drones. */
function serpent(species: string, segments: number, width: number, h: Head, look: Look): BodyPlan {
  return {
    torso: { length: width * 2.4, height: width, width },
    legs: { pairs: 0, length: 0, thickness: 0 },
    serpent: { segments },
    head: head(h),
    ...(look.features === undefined ? {} : { features: look.features }),
    machine: style(species, { ...look, machine: { boxy: false, joints: false, ...look.machine } }),
    colors: colors(look),
  };
}

const NO_TAIL = { length: 0, thickness: 0 };
const STEEL = "#7d8790";
const GUNMETAL = "#3e4a52";
const YELLOW = "#d9a51c";
const WHITE = "#e8e4da";
const BLACK = "#2b2f36";
const ALU = "#a8adb3";
const TEAL = "#2f6f73";
const COPPER = "#c87533";

const PLANS: Readonly<Record<string, RobotBody>> = {
  // The roster.
  mowbot: { height: 0.8, plan: quad("mowbot", [1, 0.45, 0.8], [0.25, 0.08], [0.35, 0.3, 0.6, 0.2], { body: "#6fa83a", accent: WHITE, machine: { antennae: { count: 1, length: 0.35 }, saw: 0.22 } }, { tail: NO_TAIL }) },
  ticklet: { height: 0.5, plan: bug("ticklet", 4, [0.4, 0.3, 0.38], [0.45, 0.04], [0.18, 0.18, 0.22, 0], { body: BLACK, accent: YELLOW, machine: { cyclops: true, antennae: { count: 2, length: 0.2 } } }) },
  craneback: { height: 2.4, plan: quad("craneback", [1.8, 0.9, 0.9], [1.1, 0.13], [0.45, 0.35, 0.4, 0.3], { body: "#e0b021", accent: BLACK, machine: { forks: 0.6, stacks: 0.4 } }, { neck: { length: 1.6, thickness: 0.14, rise: 68 } }) },
  bulldozaur: { height: 3, plan: quad("bulldozaur", [2.6, 1.3, 1.6], [0.8, 0.28], [0.9, 0.8, 1, 0.3], { body: YELLOW, accent: GUNMETAL, features: { horns: { count: 3, length: 0.7 }, frill: 1.1 }, machine: { stacks: 0.6 } }) },
  lodestone: { height: 1.5, plan: quad("lodestone", [1.5, 0.6, 0.55], [0.75, 0.09], [0.55, 0.38, 0.38, 0.7], { body: "#8a3b2c", accent: ALU, features: { horns: { count: 2, length: 0.3 } } }) },
  mirrorcat: { height: 1.6, plan: quad("mirrorcat", [1.8, 0.6, 0.6], [0.8, 0.1], [0.45, 0.38, 0.4, 0.35], { body: "#c7d3dd", accent: STEEL, machine: { boxy: false, metal: 0.95 } }, { tail: { length: 1.6, thickness: 0.08, segments: 5, droop: -0.05 } }) },
  watchwing: { height: 1.8, plan: biped("watchwing", [0.9, 0.9, 0.7], [0.7, 0.09], [0.55, 0.55, 0.6, 0.1], { body: "#6b5a44", accent: "#d8c7a0", features: { wings: 3.2, beak: true }, machine: { antennae: { count: 2, length: 0.25 } } }, { tail: { length: 0.5, thickness: 0.12, segments: 2 } }) },
  arcwire: { height: 0.9, plan: serpent("arcwire", 8, 0.5, [0.7, 0.4, 0.45, 0.5], { body: TEAL, accent: "#ffe04a", features: { sail: 0.25 }, machine: { cyclops: true, antennae: { count: 2, length: 0.4 } } }) },
  klepto: { height: 0.9, plan: biped("klepto", [0.5, 0.45, 0.4], [0.45, 0.06], [0.45, 0.45, 0.45, 0.1], { body: "#5a4a8a", accent: WHITE, machine: { antennae: { count: 2, length: 0.5 } } }) },
  rootkit: { height: 2.2, plan: quad("rootkit", [1.2, 0.7, 0.7], [0.7, 0.12], [0.4, 0.4, 0.4, 0.3], { body: "#5b4630", accent: "#5b6b3a", features: { plates: { count: 7, height: 1.1 } }, machine: { boxy: false, metal: 0.15 } }) },
  thermite: { height: 1.6, plan: bug("thermite", 3, [2, 1, 1.4], [1, 0.14], [0.6, 0.5, 0.7, 0.1], { body: "#9a3b1c", accent: GUNMETAL, features: { shell: 0.3, mandibles: 0.5 }, machine: { drill: 0.6, stacks: 0.4 } }) },
  homer: { height: 2.6, plan: biped("homer", [1.4, 1.1, 1], [0.9, 0.12], [0.6, 0.5, 0.5, 0.15], { body: ALU, accent: TEAL, features: { wings: 4.4, beak: true, hump: 0.35 }, machine: { antennae: { count: 1, length: 0.4 } } }, { tail: { length: 0.8, thickness: 0.2, segments: 2 } }) },
  echo: { height: 1.1, plan: biped("echo", [0.8, 0.5, 0.45], [0.6, 0.07], [0.45, 0.35, 0.35, 0.3], { body: WHITE, accent: "#b06bff", features: { crest: 0.5 }, machine: { cyclops: true } }) },
  choir: { height: 0.9, plan: { torso: { length: 0.6, height: 0.5, width: 0.6 }, legs: { pairs: 0, length: 0, thickness: 0 }, head: head([0.35, 0.35, 0.4, 0]), features: { wings: 1.4 }, machine: style("choir", { body: "#c8b9e8", accent: "#ff4fd8", machine: { boxy: false, cyclops: true, rotor: 0.7, joints: false } }), colors: { body: "#c8b9e8", accent: "#ff4fd8" } } },
  lampjaw: { height: 0.9, plan: { torso: { length: 1.2, height: 0.7, width: 0.6 }, legs: { pairs: 0, length: 0, thickness: 0 }, head: head([0.8, 0.7, 0.7, 0.2]), tail: { length: 1, thickness: 0.2, segments: 4 }, machine: style("lampjaw", { body: "#1c2a3a", accent: "#ffd34a", machine: { boxy: false, cyclops: true, antennae: { count: 1, length: 0.9 } } }), colors: { body: "#1c2a3a", accent: "#ffd34a" } } },
  hoover: { height: 12, plan: quad("hoover", [6, 3, 3], [2.2, 0.6], [1.2, 1, 1.1, 0.2], { body: STEEL, accent: YELLOW, features: { hump: 1, trunk: 1.4 }, machine: { stacks: 1.2, boxy: false } }, { neck: { length: 3, thickness: 0.45, rise: 12 }, tail: { length: 3, thickness: 0.5, segments: 4 } }) },
  scrapper: { height: 6, plan: biped("scrapper", [3, 1.6, 1.4], [2, 0.36], [1.4, 0.9, 0.8, 0.6], { body: "#5c2a1e", accent: "#d06a2c", features: { plates: { count: 6, height: 0.6 } }, machine: { saw: 0.6, stacks: 0.8 } }) },
  // The wider machine ecosystem.
  ripsaw: { height: 4, plan: biped("ripsaw", [2.2, 1.2, 1], [1.5, 0.26], [1, 0.7, 0.6, 0.5], { body: "#a33a2a", accent: ALU, machine: { saw: 0.5 } }) },
  platebacker: { height: 3.6, plan: quad("platebacker", [3, 1.4, 1.3], [1, 0.24], [0.6, 0.45, 0.45, 0.4], { body: "#c9c4b8", accent: "#2a3f7a", features: { plates: { count: 8, height: 0.9 }, tailSpikes: 0.4 } }) },
  sirenhorn: { height: 3.6, plan: biped("sirenhorn", [2, 1.1, 0.9], [1.3, 0.22], [0.7, 0.45, 0.4, 0.5], { body: "#d9783a", accent: "#ffe04a", features: { crest: 1.1 }, machine: { antennae: { count: 2, length: 0.4 } } }) },
  antennelk: { height: 2.6, plan: quad("antennelk", [1.6, 0.8, 0.6], [1.2, 0.08], [0.5, 0.35, 0.3, 0.5], { body: "#8c6f4a", accent: ALU, machine: { antennae: { count: 2, length: 0.9 } } }, { neck: { length: 0.8, thickness: 0.12, rise: 55 } }) },
  sparkspitter: { height: 1.5, plan: biped("sparkspitter", [0.9, 0.55, 0.45], [0.7, 0.08], [0.45, 0.32, 0.3, 0.5], { body: "#3a7a4a", accent: "#ffe04a", features: { frill: 0.35 } }) },
  ramjack: { height: 2, plan: biped("ramjack", [1.2, 0.8, 0.7], [0.9, 0.15], [0.5, 0.45, 0.45, 0.2], { body: "#6a6f78", accent: "#d06a2c", features: { dome: 0.3 } }) },
  frostbyte: { height: 1.5, plan: quad("frostbyte", [1.5, 0.6, 0.55], [0.75, 0.09], [0.55, 0.38, 0.38, 0.7], { body: "#dfe7ee", accent: "#4ac8ff", features: { horns: { count: 2, length: 0.3 } } }) },
  hulkloader: { height: 3.6, plan: quad("hulkloader", [2.4, 1.6, 1.6], [1.3, 0.3], [0.7, 0.6, 0.7, 0.3], { body: "#d06a2c", accent: GUNMETAL, features: { hump: 0.5 }, machine: { forks: 0.9 } }) },
  shrikebot: { height: 2.4, plan: biped("shrikebot", [1, 0.8, 0.6], [1.5, 0.1], [0.5, 0.4, 0.35, 0.2], { body: BLACK, accent: "#ff3b3b", features: { beak: true, crest: 0.4 } }, { neck: { length: 0.8, thickness: 0.12, rise: 60 } }) },
  liftape: { height: 4, plan: { torso: { length: 1.2, height: 1.6, width: 1.4 }, legs: { pairs: 2, length: 1.4, thickness: 0.28, biped: true, armScale: 1 }, head: head([0.6, 0.6, 0.6, 0.1]), machine: style("liftape", { body: "#5b6b3a", accent: ALU, machine: { stacks: 0.5 } }), colors: { body: "#5b6b3a", accent: ALU } } },
  coilsheep: { height: 1.3, plan: quad("coilsheep", [1.1, 0.7, 0.75], [0.5, 0.09], [0.4, 0.35, 0.35, 0.3], { body: WHITE, accent: COPPER, features: { mane: true } }, { tail: NO_TAIL }) },
  rollgrinder: { height: 2.2, plan: quad("rollgrinder", [2, 1.1, 1.4], [0.5, 0.2], [0.5, 0.45, 0.5, 0.3], { body: STEEL, accent: YELLOW, features: { shell: 0.45, club: 0.4 }, machine: { boxy: false } }) },
  clawmaul: { height: 4.2, plan: biped("clawmaul", [2.2, 1.2, 1], [1.5, 0.26], [1, 0.7, 0.6, 0.5], { body: "#4a5560", accent: "#ff9a2e", features: { horns: { count: 2, length: 0.3 } } }) },
  rhinodrill: { height: 2.4, plan: quad("rhinodrill", [2.4, 1.3, 1.2], [0.8, 0.24], [0.8, 0.6, 0.6, 0.3], { body: "#8a8f96", accent: YELLOW, machine: { drill: 0.9 } }) },
  timberjack: { height: 4.6, plan: quad("timberjack", [3.2, 2, 1.8], [1.6, 0.4], [1, 0.9, 0.9, 0.2], { body: YELLOW, accent: GUNMETAL, features: { tusks: 1.2 }, machine: { saw: 0.7, stacks: 0.7 } }) },
  warhorn: { height: 5.4, plan: biped("warhorn", [2.8, 1.5, 1.3], [1.9, 0.34], [1.3, 0.8, 0.7, 0.5], { body: GUNMETAL, accent: "#ff3b3b", features: { crest: 1 }, machine: { stacks: 1.2 } }) },
  fangsaw: { height: 1.7, plan: quad("fangsaw", [1.8, 0.7, 0.65], [0.8, 0.12], [0.55, 0.45, 0.45, 0.35], { body: "#b8862b", accent: BLACK, features: { tusks: 0.4 } }) },
  tuxbot: { height: 1.1, plan: { torso: { length: 0.5, height: 0.9, width: 0.55 }, legs: { pairs: 1, length: 0.25, thickness: 0.08, biped: true }, head: head([0.35, 0.35, 0.4, 0.2]), features: { beak: true, wings: 0.7 }, machine: style("tuxbot", { body: BLACK, accent: WHITE }), colors: { body: BLACK, belly: WHITE, accent: WHITE } } },
  smogrhino: { height: 3, plan: quad("smogrhino", [2.4, 1.3, 1.3], [0.9, 0.26], [0.8, 0.6, 0.6, 0.3], { body: "#5c5f4a", accent: "#ff9a2e", features: { horns: { count: 3, length: 0.5 }, frill: 0.7 }, machine: { stacks: 0.9 } }) },
  ironbear: { height: 2.8, plan: quad("ironbear", [2.2, 1.4, 1.3], [0.9, 0.28], [0.7, 0.6, 0.6, 0.3], { body: "#4a3a2e", accent: ALU, features: { hump: 0.3 } }) },
  coilcobra: { height: 0.7, plan: serpent("coilcobra", 9, 0.35, [0.5, 0.3, 0.45, 0.3], { body: "#3a3d42", accent: COPPER, features: { frill: 0.35 } }) },
  puckbot: { height: 0.5, plan: quad("puckbot", [0.8, 0.3, 0.8], [0.12, 0.05], [0.2, 0.18, 0.6, 0], { body: WHITE, accent: "#4ac8ff", machine: { boxy: false, antennae: { count: 1, length: 0.25 } } }, { tail: NO_TAIL }) },
  bumperbot: { height: 1.8, plan: quad("bumperbot", [1.8, 1.2, 1.3], [0.5, 0.2], [0.6, 0.5, 0.6, 0.2], { body: "#d03a3a", accent: WHITE, machine: { boxy: false } }) },
  highrise: { height: 8, plan: quad("highrise", [3.2, 1.8, 1.6], [3, 0.3], [0.9, 0.6, 0.6, 0.4], { body: YELLOW, accent: GUNMETAL, machine: { antennae: { count: 2, length: 0.8 } } }, { neck: { length: 2.4, thickness: 0.35, rise: 55 } }) },
  pistonmare: { height: 2.2, plan: quad("pistonmare", [1.9, 0.9, 0.7], [1.2, 0.12], [0.7, 0.4, 0.35, 0.5], { body: GUNMETAL, accent: "#d06a2c", features: { mane: true } }, { neck: { length: 0.8, thickness: 0.2, rise: 50 } }) },
  zipstrider: { height: 2.6, plan: biped("zipstrider", [0.9, 0.8, 0.6], [1.6, 0.1], [0.4, 0.3, 0.3, 0.3], { body: WHITE, accent: TEAL, features: { beak: true } }, { neck: { length: 1, thickness: 0.1, rise: 65 } }) },
  sawbeaver: { height: 1.4, plan: quad("sawbeaver", [1.4, 0.8, 0.8], [0.35, 0.12], [0.5, 0.45, 0.5, 0.3], { body: "#8a5a33", accent: ALU, features: { club: 0.3 }, machine: { saw: 0.3 } }) },
  hivedrone: { height: 1.1, plan: bug("hivedrone", 4, [0.9, 0.6, 0.8], [0.9, 0.07], [0.4, 0.35, 0.45, 0], { body: "#2b2230", accent: "#b06bff", features: { mandibles: 0.25 }, machine: { antennae: { count: 2, length: 0.3 } } }) },
  heatsink: { height: 2, plan: quad("heatsink", [2.2, 0.8, 0.9], [0.5, 0.16], [0.6, 0.4, 0.45, 0.5], { body: "#a84a2c", accent: "#ffb36b", features: { sail: 0.9 } }) },
  snapjaw: { height: 1.3, plan: quad("snapjaw", [2, 0.6, 0.8], [0.35, 0.14], [0.9, 0.35, 0.45, 0.9], { body: "#4f5a3a", accent: ALU, features: { tailSpikes: 0.2 } }) },
  springtoad: { height: 1.5, plan: quad("springtoad", [1.2, 0.9, 1.1], [0.55, 0.16], [0.6, 0.5, 0.8, 0.1], { body: "#6a9a3a", accent: BLACK, machine: { antennae: { count: 2, length: 0.2 } } }, { tail: NO_TAIL }) },
  siphon: { height: 0.3, plan: serpent("siphon", 6, 0.2, [0.2, 0.18, 0.2, 0.2], { body: "#3a1e24", accent: "#ff4fd8" }) },
  riptide: { height: 3.4, plan: biped("riptide", [2.2, 1.1, 0.9], [1.4, 0.24], [1.2, 0.5, 0.45, 0.9], { body: "#2f5f8a", accent: WHITE, features: { sail: 0.5 } }) },
  railcrawler: { height: 0.7, plan: bug("railcrawler", 4, [2.4, 0.4, 0.5], [0.5, 0.06], [0.35, 0.3, 0.4, 0], { body: "#5a4a2e", accent: YELLOW, features: { mandibles: 0.25 }, machine: { antennae: { count: 2, length: 0.4 } } }) },
  stingvolt: { height: 1.2, plan: bug("stingvolt", 4, [1.2, 0.5, 0.8], [0.8, 0.08], [0.45, 0.35, 0.5, 0], { body: BLACK, accent: "#ffe04a", features: { mandibles: 0.4, club: 0.2 } }, { tail: { length: 1.4, thickness: 0.12, segments: 5, droop: -0.6 } }) },
  wallcrawler: { height: 1.4, plan: quad("wallcrawler", [2, 0.6, 0.8], [0.45, 0.14], [0.6, 0.4, 0.45, 0.5], { body: "#3a5a4a", accent: "#d06a2c" }, { tail: { length: 1.8, thickness: 0.18, segments: 5 } }) },
  pylon: { height: 7, plan: quad("pylon", [4.4, 2, 2], [2, 0.5], [0.9, 0.6, 0.6, 0.4], { body: ALU, accent: "#ffe04a", machine: { antennae: { count: 2, length: 1.2 } } }, { neck: { length: 3, thickness: 0.4, rise: 40 }, tail: { length: 3.5, thickness: 0.4, segments: 5 } }) },
  switchback: { height: 3.4, plan: biped("switchback", [1.8, 1, 0.9], [1.3, 0.2], [0.7, 0.45, 0.4, 0.5], { body: "#8a9a5a", accent: WHITE, machine: { antennae: { count: 1, length: 0.5 } } }) },
};

/** The Hivemind: a queen node many times a drone's size, darker the harder she is. */
const hivemind = (body: string): RobotBody => ({
  height: 9,
  plan: bug("hivedrone", 4, [4, 2, 3.4], [3.4, 0.3], [1.4, 1.1, 1.4, 0], { body, accent: "#b06bff", glow: "#d68bff", features: { shell: 0.8, mandibles: 1 }, machine: { antennae: { count: 2, length: 1.6 }, stacks: 1 } }),
});

export const ROBOT_BODIES: Readonly<Record<string, RobotBody>> = {
  ...PLANS,
  hivemind_gamma: hivemind("#1e1626"),
  hivemind_beta: hivemind("#2a1838"),
  hivemind_alpha: hivemind("#3a0f16"),
};

/** A tiny scavenger drone and a circling sentry for the ambient sky (ambientFauna.ts). */
export const AMBIENT_BODIES = {
  microdrone: { height: 0.25, plan: PLANS["choir"]!.plan },
  watchwing: PLANS["watchwing"]!,
} as const satisfies Record<string, RobotBody>;

