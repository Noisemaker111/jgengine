import type { BodyPlan } from "@jgengine/core/creatureBody/bodyPlan";

/**
 * Bodies for the species with no imported model: our own low-poly shapes (never ARK's art), built
 * from body-plan knobs and drawn at roughly ARK's standing height in metres.
 */
export interface SpeciesBody {
  height: number;
  plan: BodyPlan;
}

type Legs = BodyPlan["legs"];
const quad = (length: number, thickness: number): Legs => ({ pairs: 2, length, thickness });
const biped = (length: number, thickness: number, armScale = 0.4): Legs => ({ pairs: 2, length, thickness, biped: true, armScale });
const NONE: Legs = { pairs: 0, length: 0, thickness: 0 };

/** A theropod: horizontal body on two legs, small arms, long tail. */
const theropod = (size: number, colors: BodyPlan["colors"], features: BodyPlan["features"] = {}, head = 1, neck = 0.5): BodyPlan => ({
  torso: { length: 1.6 * size, height: 0.75 * size, width: 0.62 * size },
  legs: biped(1.05 * size, 0.15 * size, 0.38),
  neck: { length: 0.45 * size * neck * 2, thickness: 0.2 * size, rise: 35 },
  head: { length: 0.75 * size * head, height: 0.42 * size * head, width: 0.34 * size * head, snout: 0.45 },
  tail: { length: 2 * size, thickness: 0.26 * size, segments: 5, droop: 0.05 },
  features,
  colors,
});

/** A sauropod: barrel body, pillar legs, a very long neck and tail. */
const sauropod = (size: number, colors: BodyPlan["colors"]): BodyPlan => ({
  torso: { length: 2.6 * size, height: 1.5 * size, width: 1.4 * size },
  legs: quad(1.6 * size, 0.3 * size),
  neck: { length: 3.2 * size, thickness: 0.32 * size, rise: 48 },
  head: { length: 0.55 * size, height: 0.35 * size, width: 0.32 * size, snout: 0.25 },
  tail: { length: 3.6 * size, thickness: 0.4 * size, segments: 6, droop: 0.06 },
  colors,
});

/** A big mammal on four legs. */
const mammal = (size: number, colors: BodyPlan["colors"], features: BodyPlan["features"] = {}, neck = 0.35, legLength = 0.95): BodyPlan => ({
  torso: { length: 1.7 * size, height: 0.95 * size, width: 0.8 * size },
  legs: quad(legLength * size, 0.17 * size),
  neck: { length: neck * size, thickness: 0.26 * size, rise: 30 },
  head: { length: 0.6 * size, height: 0.42 * size, width: 0.38 * size, snout: 0.35 },
  tail: { length: 0.4 * size, thickness: 0.06 * size, segments: 2, droop: 0.4 },
  features,
  colors,
});

/** Something low and long on four short legs: lizards, amphibians, crocodiles. */
const crawler = (size: number, colors: BodyPlan["colors"], features: BodyPlan["features"] = {}, snout = 0.6, tail = 1.6): BodyPlan => ({
  torso: { length: 1.4 * size, height: 0.45 * size, width: 0.6 * size },
  legs: quad(0.38 * size, 0.11 * size),
  head: { length: 0.55 * size, height: 0.25 * size, width: 0.38 * size, snout },
  tail: { length: tail * size, thickness: 0.18 * size, segments: 4, droop: 0.02 },
  features,
  colors,
});

/** A bug: segmented legs splayed out sideways. */
const bug = (size: number, pairs: 3 | 4, colors: BodyPlan["colors"], features: BodyPlan["features"] = {}, tail?: BodyPlan["tail"]): BodyPlan => ({
  torso: { length: 1.1 * size, height: 0.5 * size, width: 0.8 * size },
  legs: { pairs, length: 0.95 * size, thickness: 0.06 * size },
  head: { length: 0.45 * size, height: 0.32 * size, width: 0.45 * size, snout: 0 },
  ...(tail === undefined ? {} : { tail }),
  features,
  colors,
});

const bird = (size: number, colors: BodyPlan["colors"], features: BodyPlan["features"] = {}, neck = 0.9): BodyPlan => ({
  torso: { length: 1 * size, height: 0.7 * size, width: 0.6 * size },
  legs: { pairs: 1, length: 0.95 * size, thickness: 0.07 * size },
  neck: { length: 0.55 * size * neck, thickness: 0.13 * size, rise: 70 },
  head: { length: 0.42 * size, height: 0.3 * size, width: 0.26 * size, snout: 0 },
  tail: { length: 0.35 * size, thickness: 0.12 * size, segments: 1, droop: -0.3 },
  features: { beak: true, ...features },
  colors,
});

const flyer = (size: number, colors: BodyPlan["colors"], features: BodyPlan["features"] = {}): BodyPlan => ({
  ...bird(size, colors, { wings: 4.5 * size, ...features }, 0.7),
  legs: { pairs: 1, length: 0.6 * size, thickness: 0.06 * size },
});

/** Each species' body, keyed like {@link SPECIES}. */
export const BODIES: Readonly<Record<string, SpeciesBody>> = {
  carnotaurus: { height: 4, plan: theropod(1, { body: "#8a3b2c", belly: "#c99a7a", accent: "#3a2a22" }, { horns: { count: 2, length: 0.35 } }, 0.85) },
  triceratops: {
    height: 3,
    plan: { ...mammal(1.2, { body: "#6f7b4f", belly: "#c9bf98", accent: "#e8dcc0" }, { horns: { count: 3, length: 0.9 }, frill: 0.75, beak: true }, 0.05, 0.75), tail: { length: 1.3, thickness: 0.32, segments: 4, droop: 0.06 } },
  },
  stegosaurus: {
    height: 4,
    plan: {
      torso: { length: 2.6, height: 1.5, width: 1.2 },
      legs: quad(1.15, 0.24),
      neck: { length: 0.6, thickness: 0.24, rise: -10 },
      head: { length: 0.55, height: 0.3, width: 0.28, snout: 0.3 },
      tail: { length: 2.4, thickness: 0.36, segments: 5, droop: 0.04 },
      features: { plates: { count: 11, height: 0.9 }, tailSpikes: 0.6 },
      colors: { body: "#5d6b3e", belly: "#b8b08a", accent: "#b0552f" },
    },
  },
  parasaur: { height: 4, plan: { ...theropod(1.1, { body: "#4f7a6a", belly: "#d6cfa8", accent: "#c25a35" }, { crest: 1.1, beak: true }, 0.9, 0.9), legs: biped(1.1, 0.16, 0.6) } },
  megaloceros: { height: 2.8, plan: mammal(1, { body: "#8a6a45", belly: "#d8c4a0", accent: "#e9dcbf" }, { horns: { count: 2, length: 1.1 } }, 0.55, 1.1) },
  pteranodon: { height: 2, plan: flyer(0.9, { body: "#b8a58a", belly: "#efe6d2", accent: "#8a4a2c" }, { crest: 0.7 }) },
  rex: { height: 6, plan: theropod(1.3, { body: "#5c5a3a", belly: "#c8b58e", accent: "#2f2a20" }, {}, 1.25) },
  dilophosaur: { height: 1.6, plan: theropod(0.55, { body: "#6a8a3a", belly: "#e0d090", accent: "#d14b2a" }, { frill: 0.35, crest: 0.25 }) },
  pachy: { height: 2, plan: { ...theropod(0.7, { body: "#7a6450", belly: "#d4c2a0", accent: "#d8cdb6" }, { dome: 0.22, beak: true }, 0.9), legs: biped(0.8, 0.12, 0.35) } },
  direwolf: { height: 1.6, plan: mammal(0.75, { body: "#5f5f63", belly: "#c8c8cc", accent: "#2a2a2e" }, { mane: true }, 0.35, 1) },
  chalicotherium: { height: 4, plan: { ...mammal(1.3, { body: "#6d5a48", belly: "#bba78c", accent: "#3b3028" }, { hump: 0.25 }, 0.45, 1.1), legs: quad(1.25, 0.2) } },
  terror_bird: { height: 2.4, plan: bird(1, { body: "#4a3a2c", belly: "#8a7258", accent: "#e0b030" }) },
  gigantopithecus: {
    height: 5,
    plan: {
      torso: { length: 1.2, height: 1.6, width: 1.3 },
      legs: { pairs: 2, length: 1.1, thickness: 0.3, biped: true, armScale: 1.1 },
      head: { length: 0.6, height: 0.6, width: 0.55, snout: 0.15 },
      features: { mane: true },
      colors: { body: "#e2ddd3", belly: "#bdb6aa", accent: "#f4f1ea" },
    },
  },
  ovis: { height: 1.4, plan: mammal(0.6, { body: "#e9e2d2", belly: "#d8cfbd", accent: "#4a3a2e" }, { horns: { count: 2, length: 0.25 }, mane: true }, 0.25, 0.85) },
  purlovia: { height: 1.2, plan: crawler(0.8, { body: "#c2a172", belly: "#e8d8b8", accent: "#5a4430" }, {}, 0.3, 1.2) },
  titanomyrma: { height: 0.7, plan: bug(0.5, 3, { body: "#3a1a14", accent: "#6a2a1c" }, { mandibles: 0.2 }, { length: 0.6, thickness: 0.22, segments: 1, droop: 0.2 }) },
  troodon: { height: 1, plan: theropod(0.4, { body: "#5a6a4a", belly: "#c8c098", accent: "#e8c040" }, {}, 1.1) },
  ankylosaurus: {
    height: 2.5,
    plan: { ...crawler(1.6, { body: "#7a6a4a", belly: "#c0b088", accent: "#5a4a32" }, { shell: 0.15, club: 0.32, beak: true }, 0.2, 1.2), legs: quad(0.75, 0.2) },
  },
  argentavis: { height: 3, plan: flyer(1.2, { body: "#3a2e26", belly: "#6a5848", accent: "#f0e8dc" }) },
  doedicurus: {
    height: 2.2,
    plan: { ...crawler(1.4, { body: "#5a4a3a", belly: "#a08a70", accent: "#7a6650" }, { shell: 0.35, club: 0.3 }, 0.15, 0.9), legs: quad(0.55, 0.18) },
  },
  allosaurus: { height: 4.5, plan: theropod(1.1, { body: "#7a5a3a", belly: "#d0b890", accent: "#a03020" }, { crest: 0.2 }) },
  woolly_rhino: { height: 2.5, plan: mammal(1.15, { body: "#6a4a2e", belly: "#8a6a4a", accent: "#e0d4b8" }, { horns: { count: 1, length: 0.8 }, mane: true }, 0.15, 0.7) },
  mammoth: { height: 5, plan: mammal(1.9, { body: "#5a3a24", belly: "#7a5a3c", accent: "#efe6d0" }, { tusks: 1.4, trunk: 1.1, hump: 0.3, mane: true }, 0.15, 1.05) },
  yutyrannus: { height: 5.5, plan: theropod(1.25, { body: "#a08a6a", belly: "#e0d0b0", accent: "#c04a2a" }, { mane: true, crest: 0.3 }, 1.15) },
  sabertooth: { height: 1.8, plan: mammal(0.85, { body: "#b88a4a", belly: "#ecd8b0", accent: "#f2ead8" }, { tusks: 0.35 }, 0.3, 0.95) },
  kairuku: {
    height: 1.1,
    plan: {
      torso: { length: 0.7, height: 1, width: 0.7 },
      legs: { pairs: 1, length: 0.25, thickness: 0.12 },
      head: { length: 0.4, height: 0.32, width: 0.3, snout: 0 },
      features: { beak: true, wings: 1 },
      colors: { body: "#1c2430", belly: "#eef0f2", accent: "#e8a030" },
    },
  },
  pachyrhinosaurus: { height: 3, plan: mammal(1.15, { body: "#8a6a4a", belly: "#d0c0a0", accent: "#d8c8a8" }, { frill: 0.6, dome: 0.2, beak: true }, 0.05, 0.75) },
  thylacoleo: { height: 2, plan: mammal(0.95, { body: "#9a8460", belly: "#d8c8a8", accent: "#3a3028" }, {}, 0.25, 0.9) },
  direbear: { height: 3, plan: { ...mammal(1.4, { body: "#4a3424", belly: "#6a4c38", accent: "#2a1e16" }, { hump: 0.25 }, 0.25, 0.85), tail: { length: 0.15, thickness: 0.08, segments: 1 } } },
  titanoboa: { height: 1.3, plan: { torso: { length: 1, height: 0.45, width: 0.45 }, legs: NONE, head: { length: 0.6, height: 0.3, width: 0.4, snout: 0.15 }, serpent: { segments: 10 }, colors: { body: "#3a5a2a", belly: "#c8c090", accent: "#1a2a12" } } },
  lystrosaurus: { height: 0.7, plan: crawler(0.5, { body: "#c08a5a", belly: "#ead0b0", accent: "#e8dcc4" }, { tusks: 0.12, beak: true }, 0.15, 0.4) },
  moschops: { height: 2, plan: { ...mammal(1, { body: "#8a7a5a", belly: "#c8b898", accent: "#6a5a40" }, { dome: 0.2 }, 0.1, 0.65), torso: { length: 1.6, height: 1.1, width: 0.9 } } },
  compy: { height: 0.6, plan: theropod(0.22, { body: "#6a8a40", belly: "#e0e0a8", accent: "#305020" }) },
  paraceratherium: { height: 9, plan: mammal(2.4, { body: "#8a7a6a", belly: "#b8aa98", accent: "#5a4c40" }, {}, 1.2, 1.4) },
  equus: { height: 2.2, plan: mammal(0.95, { body: "#7a5a3a", belly: "#c0a07a", accent: "#2a1e14" }, { mane: true }, 0.65, 1.15) },
  gallimimus: { height: 2.8, plan: { ...theropod(0.8, { body: "#8a7a5a", belly: "#e0d4b0", accent: "#5a6a8a" }, { beak: true }, 0.6, 1.6), legs: biped(1.3, 0.1, 0.4) } },
  castoroides: { height: 1.6, plan: { ...crawler(1.1, { body: "#5a3a24", belly: "#8a6a4a", accent: "#e8d060" }, { tusks: 0.1 }, 0.25, 0.6), tail: { length: 0.8, thickness: 0.28, segments: 2, droop: 0 } } },
  araneo: { height: 1.3, plan: bug(1, 4, { body: "#2a2420", belly: "#5a3a2a", accent: "#c03a2a" }, { mandibles: 0.25 }, { length: 0.9, thickness: 0.45, segments: 1, droop: 0.15 }) },
  dimetrodon: { height: 2.2, plan: crawler(1.3, { body: "#8a5a3a", belly: "#d0b090", accent: "#c07a3a" }, { sail: 0.9 }, 0.45, 1.3) },
  kaprosuchus: { height: 1.4, plan: { ...crawler(1, { body: "#4a5a3a", belly: "#c0b890", accent: "#2a3020" }, { tusks: 0.15 }, 0.8, 1.6), legs: quad(0.55, 0.12) } },
  sarco: { height: 1.5, plan: crawler(1.5, { body: "#3e4a32", belly: "#b8b08a", accent: "#22281a" }, {}, 1.1, 1.8) },
  beelzebufo: {
    height: 1.6,
    plan: { torso: { length: 1.3, height: 0.9, width: 1.1 }, legs: quad(0.5, 0.18), head: { length: 0.8, height: 0.45, width: 0.9, snout: 0 }, colors: { body: "#6a8a30", belly: "#e0d8a0", accent: "#3a4a18" } },
  },
  leech: { height: 0.5, plan: { torso: { length: 0.5, height: 0.3, width: 0.32 }, legs: NONE, head: { length: 0.25, height: 0.2, width: 0.25, snout: 0 }, serpent: { segments: 3 }, colors: { body: "#3a2a2a", accent: "#6a2020" } } },
  meganeura: {
    height: 0.8,
    plan: { torso: { length: 0.5, height: 0.25, width: 0.25 }, legs: { pairs: 3, length: 0.25, thickness: 0.03 }, head: { length: 0.22, height: 0.2, width: 0.25, snout: 0 }, tail: { length: 1, thickness: 0.07, segments: 3, droop: 0 }, features: { wings: 1.8 }, colors: { body: "#2a5a6a", accent: "#a8d8e0" } },
  },
  diplocaulus: { height: 0.8, plan: crawler(0.7, { body: "#6a7a5a", belly: "#d8d0b0", accent: "#4a5a3a" }, { frill: 0.35 }, 0.1, 1.2) },
  baryonyx: { height: 3.5, plan: theropod(0.95, { body: "#4a6a6a", belly: "#c8c8b0", accent: "#2a3a3a" }, { sail: 0.2 }, 1.2) },
  arthropleura: {
    height: 1.4,
    plan: { torso: { length: 1, height: 0.5, width: 0.9 }, legs: { pairs: 4, length: 0.7, thickness: 0.06 }, head: { length: 0.4, height: 0.3, width: 0.5, snout: 0 }, serpent: { segments: 6 }, features: { mandibles: 0.2 }, colors: { body: "#4a2a1a", accent: "#c08a3a" } },
  },
  pulmonoscorpius: { height: 1.3, plan: bug(1, 4, { body: "#3a2a1a", accent: "#8a6a2a" }, { mandibles: 0.45 }, { length: 1.6, thickness: 0.18, segments: 4, droop: -0.6 }) },
  megalania: { height: 1.6, plan: crawler(1.6, { body: "#6a5a3a", belly: "#c8b88a", accent: "#3a3020" }, {}, 0.5, 1.8) },
  brontosaurus: { height: 14, plan: sauropod(1.6, { body: "#6a6a5a", belly: "#b8b4a0", accent: "#4a4a3e" }) },
  diplodocus: { height: 6, plan: { ...sauropod(1.1, { body: "#7a6a4a", belly: "#c8b898", accent: "#4a3e2c" }), neck: { length: 3.2, thickness: 0.3, rise: 15 } } },
  iguanodon: { height: 3.5, plan: { ...theropod(1, { body: "#6a7a4a", belly: "#d0c8a0", accent: "#e0d8c0" }, { beak: true }, 0.9), legs: biped(1.1, 0.17, 0.7) } },
};
