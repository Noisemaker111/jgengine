import type { AutoRigOptions } from "@jgengine/core/creatureBody/autoRig";

/**
 * Where each creature's model comes from. Every file is a free model (CC0 or CC-BY), never ARK's
 * art. Animated ones are used as they are; static ones carry `rig`, and `scripts/bake-creatures.ts`
 * downloads them and gives them a skeleton and gait clips with the engine's `autoRig`. The in-game
 * credits are read from this table.
 */
export interface CreatureModelSource {
  title: string;
  author: string;
  license: "CC0 1.0" | "CC-BY 3.0";
  /** The model's page. */
  page: string;
  /** poly.pizza resource id the bake downloads (`https://static.poly.pizza/<id>.glb`). */
  resource: string;
  /** How a static model is rigged; omitted for a model that ships animated. */
  rig?: AutoRigOptions;
}

const polyPizza = (id: string) => `https://poly.pizza/m/${id}`;
const quaternius = (title: string, id: string, resource: string): CreatureModelSource => ({ title, author: "Quaternius", license: "CC0 1.0", page: polyPizza(id), resource });
const polyGoogle = (title: string, id: string, resource: string, rig: AutoRigOptions): CreatureModelSource => ({ title, author: "Poly by Google", license: "CC-BY 3.0", page: polyPizza(id), resource, rig });

/** Model files under `/models/imported/creatures/`, by file name. */
export const CREATURE_MODEL_SOURCES = {
  velociraptor: quaternius("Velociraptor", "cnlGH2UcDd", "c1f0c4cb-c84f-415c-8323-d8cb871a2126"),
  trex: quaternius("T-Rex", "UYtneO5FpF", "34eed102-48f0-43dd-bc6f-ef7a6dfddfbb"),
  triceratops: quaternius("Triceratops", "IGvrUqGrRM", "6aa1f3ff-b9b3-4bb5-9d85-b2ffa514f0cc"),
  stegosaurus: quaternius("Stegosaurus", "eFcNbOlpvl", "6f8f4ac6-f9e8-488d-97a8-220b9b2fd02a"),
  parasaurolophus: quaternius("Parasaurolophus", "KeeQrrouRK", "47b9d0bd-cddb-49be-b072-12201def24a9"),
  apatosaurus: quaternius("Apatosaurus", "fvo0x8Zk3z", "7b873860-f23f-4266-b341-5c5e6770cfa0"),
  wolf: quaternius("Wolf", "P1gU3Qkr9r", "f1d12388-e39b-4157-b32a-646a1d089fc4"),
  stag: quaternius("Stag", "tQdzbZ1Cmw", "a9c69fbc-bf7c-4585-9a49-a82e0be1ac6b"),
  horse: quaternius("Horse", "qvTrSG9pZF", "d37dbc87-ca61-4b2c-a2da-d2f0c4240bef"),
  sheep: quaternius("Sheep", "rgJXF570ZK", "d42145b6-ae20-48cd-ba36-63b03f901c32"),
  yeti: quaternius("Yeti", "ceRHrn8HHE", "40a831b3-686a-4af8-b189-a13b38a3c26a"),
  spider: quaternius("Spider", "yRYJiAJyiM", "4259fbdb-afb5-4d40-9108-363625dd6b6e"),
  frog: quaternius("Frog", "9Z2V8fpazF", "08416495-b056-4ed7-b23b-5a10e82277a0"),
  snake: quaternius("Snake", "x9x0viZs8V", "0f3a551e-743e-48f5-936f-804c6c3b88bd"),
  dove: polyGoogle("Dove", "2jmH3trzPFf", "7ef274a4-4d73-4eee-96e4-209ba68a3146", { shape: "biped", head: 0.3, tail: 0.25 }),
  tyrannosaur: polyGoogle("T-Rex", "9GyZw9gGPMq", "312dd095-a50a-4293-a355-ff6dbe92ddb5", { shape: "biped", head: 0.25, tail: 0.45 }),
  diplodocus: polyGoogle("Diplodocus", "12n6ICAVpYB", "e60784f1-7b8c-4239-8354-c5d575a864a0", { shape: "quadruped", head: 0.32, tail: 0.38 }),
  elephant: polyGoogle("Elephant", "cx0-TiCjDOx", "2bc73032-37c9-4276-a620-437df45db428", { shape: "quadruped", head: 0.3, tail: 0.06 }),
  white_rhinoceros: polyGoogle("Rhinoceros", "11qk1uy0YGH", "750c368c-d060-4055-82ea-efde3749fae5", { shape: "quadruped", head: 0.28, tail: 0.06 }),
  ground_sloth: polyGoogle("Ground sloth", "34WS63awSqJ", "eb938e39-4d71-4505-b478-4cfb62588143", { shape: "quadruped", head: 0.2, tail: 0.1 }),
  tiger: polyGoogle("Tiger", "5A3w06FXUup", "460ff96a-ea48-4b39-b38c-d0c7daa06a3c", { shape: "quadruped", head: 0.22, tail: 0.3 }),
  jaguar: polyGoogle("Jaguar", "4fb-oMr2uUF", "1ba852c9-b39a-4869-b8da-b493e17ba989", { shape: "quadruped", head: 0.22, tail: 0.3 }),
  bear: polyGoogle("Bear", "a4hZyH8vVph", "4fbef08d-01e3-4a33-970d-d44df6e7c3b1", { shape: "quadruped", facing: "+x", head: 0.25, tail: 0.05 }),
  hyena: polyGoogle("Spotted hyena", "0yU1LU3Nkpu", "3f0be496-5834-43f5-bc14-fd5201c23708", { shape: "quadruped", head: 0.25, tail: 0.15 }),
  peccary: polyGoogle("Collared peccary", "3eoOcw_d00X", "63773da4-4131-4536-9bc9-d903433af33f", { shape: "quadruped", head: 0.28, tail: 0.05 }),
  hippopotamus: polyGoogle("Hippopotamus", "4HNi8dZMdZa", "cdfb284b-720e-4b1f-88f5-82bce3a2286c", { shape: "quadruped", head: 0.3, tail: 0.05 }),
  penguin: polyGoogle("Penguin", "fBXvsC6pe_V", "f242d6d3-67cd-41b4-ae93-4cfd0acf8b5e", { shape: "biped", head: 0.3, tail: 0 }),
  beaver: polyGoogle("Beaver", "fwtA7VLrXPr", "fb953f9b-18e0-4c1e-9df0-dc69d1499aab", { shape: "quadruped", head: 0.25, tail: 0.3 }),
  armadillo: polyGoogle("Armadillo", "37B4Oz7HDqC", "4884b5e5-ebdc-4817-91d3-e72073fbec53", { shape: "quadruped", head: 0.25, tail: 0.25 }),
  giant_armadillo: polyGoogle("Armadillo", "81WIGctw3se", "67f5b7f1-9ea2-4df6-92f7-f8802752c74f", { shape: "quadruped", head: 0.25, tail: 0.25 }),
  gecko: polyGoogle("Salamander", "eqjMAgmr-pM", "d7fe4fa8-be91-4e77-8876-e88f6e9501c2", { shape: "quadruped", head: 0.22, tail: 0.4 }),
  fire_salamander: { title: "Lizard", author: "madtrollstudio", license: "CC-BY 3.0", page: polyPizza("0z3NJc5zAE"), resource: "89755743-58e0-4d4f-80f9-c24c267f0bf4", rig: { shape: "quadruped", head: 0.15, tail: 0.4 } },
  crocodile: polyGoogle("Crocodile", "2an6E2WjW3z", "4b11bdab-4e99-42a6-9919-3a27e1f3b44a", { shape: "quadruped", head: 0.22, tail: 0.42 }),
  earthworm: polyGoogle("Earthworm", "6Isq2Aqy4MR", "40d525c4-6aac-4a00-88df-c7610a73f608", { shape: "serpent" }),
  dragonfly: polyGoogle("Dragonfly", "0myA_BOcZrD", "a657ff87-2200-4062-bd01-740ce06f524d", { shape: "flyer", head: 0.15, tail: 0.5, legTop: 0.3 }),
  centipede: polyGoogle("Centipede", "8C36B7L_2hR", "9327363c-2475-4f8b-83fa-d131562a1f87", { shape: "serpent" }),
  scorpion: polyGoogle("Scorpion", "6Bu7d_Pkm5o", "0910d661-44e4-43d0-86d9-a55012e53949", { shape: "bug", legPairs: 4, head: 0.25, tail: 0.35 }),
  ant: polyGoogle("Ant", "90PJjBye5ZC", "1f422002-4e86-4874-a82c-4551ad6223e9", { shape: "bug", legPairs: 3, head: 0.22, tail: 0.3 }),
  vulture: polyGoogle("Turkey vulture", "fvAgunyr1kd", "731a1ee8-ef73-43fd-b4cd-aee5005a17c0", { shape: "biped", head: 0.3, tail: 0.2 }),
  eagle: polyGoogle("Eagle", "d7CSLvsHULY", "903c859a-1f1a-45dd-a6bc-55b505244597", { shape: "biped", head: 0.25, tail: 0.2 }),
  emu: polyGoogle("Emu", "dVhJSddeK67", "f8243360-9a71-4562-80df-d085d73eef98", { shape: "biped", head: 0.3, tail: 0.15 }),
  ostrich: polyGoogle("Ostrich", "1LtIviy4khn", "075449c4-8773-4d6c-844a-5daa438cb30e", { shape: "biped", head: 0.3, tail: 0.15 }),
} as const satisfies Record<string, CreatureModelSource>;

export type CreatureModelFile = keyof typeof CREATURE_MODEL_SOURCES;

/** A species' body: which model, how tall it stands in metres, and a tint over the model's own colours. */
export interface SpeciesModel {
  file: CreatureModelFile;
  height: number;
  tint?: string;
  /** The model materials the tint paints (its hide), leaving eyes, teeth and belly; omit for all. */
  tintMaterials?: readonly string[];
}

/**
 * Every species' model. Where no free model of the animal exists, its nearest relative stands in at
 * the species' size and colour (README "Gap to target" lists which).
 */
export const SPECIES_MODELS: Readonly<Record<string, SpeciesModel>> = {
  dodo: { file: "dove", height: 0.8, tint: "#8a8478" },
  phiomia: { file: "elephant", height: 1.9, tint: "#9a8670" },
  raptor: { file: "velociraptor", height: 1.7, tint: "#a86040", tintMaterials: ["Brown"] },
  carnotaurus: { file: "trex", height: 4, tint: "#c0604a", tintMaterials: ["Green", "LightGreen"] },
  triceratops: { file: "triceratops", height: 3 },
  stegosaurus: { file: "stegosaurus", height: 4 },
  parasaur: { file: "parasaurolophus", height: 4 },
  megaloceros: { file: "stag", height: 2.8 },
  pteranodon: { file: "eagle", height: 2, tint: "#c8b090" },
  rex: { file: "trex", height: 6 },
  dilophosaur: { file: "velociraptor", height: 1.6, tint: "#a8c070", tintMaterials: ["Brown"] },
  pachy: { file: "parasaurolophus", height: 2, tint: "#b09070", tintMaterials: ["Green", "LightGreen"] },
  direwolf: { file: "wolf", height: 1.6 },
  chalicotherium: { file: "ground_sloth", height: 4 },
  terror_bird: { file: "emu", height: 2.4, tint: "#7a6048" },
  gigantopithecus: { file: "yeti", height: 5 },
  ovis: { file: "sheep", height: 1.4 },
  purlovia: { file: "hyena", height: 1.2, tint: "#d0b080" },
  titanomyrma: { file: "ant", height: 0.7 },
  troodon: { file: "velociraptor", height: 1, tint: "#90a070", tintMaterials: ["Brown"] },
  ankylosaurus: { file: "giant_armadillo", height: 2.5, tint: "#a09068" },
  argentavis: { file: "vulture", height: 3 },
  doedicurus: { file: "armadillo", height: 2.2, tint: "#806a54" },
  allosaurus: { file: "tyrannosaur", height: 4.5, tint: "#c8a080" },
  woolly_rhino: { file: "white_rhinoceros", height: 2.5, tint: "#a87850" },
  mammoth: { file: "elephant", height: 5, tint: "#a87850" },
  yutyrannus: { file: "trex", height: 5.5, tint: "#d8c098", tintMaterials: ["Green", "LightGreen"] },
  sabertooth: { file: "tiger", height: 1.8 },
  kairuku: { file: "penguin", height: 1.1 },
  pachyrhinosaurus: { file: "triceratops", height: 3, tint: "#c09060", tintMaterials: ["Brown"] },
  thylacoleo: { file: "jaguar", height: 2 },
  direbear: { file: "bear", height: 3 },
  titanoboa: { file: "snake", height: 1.3 },
  lystrosaurus: { file: "peccary", height: 0.7, tint: "#d0a070" },
  moschops: { file: "hippopotamus", height: 2, tint: "#b0a080" },
  compy: { file: "velociraptor", height: 0.6, tint: "#88b060", tintMaterials: ["Brown"] },
  paraceratherium: { file: "white_rhinoceros", height: 9 },
  equus: { file: "horse", height: 2.2 },
  gallimimus: { file: "ostrich", height: 2.8 },
  castoroides: { file: "beaver", height: 1.6 },
  araneo: { file: "spider", height: 1.3 },
  // The Broodmother: Araneo's queen, dark and many times its size; brighter the harder she is.
  broodmother_gamma: { file: "spider", height: 10, tint: "#3a2c3e" },
  broodmother_beta: { file: "spider", height: 10, tint: "#4a2a5a" },
  broodmother_alpha: { file: "spider", height: 10, tint: "#6a1f2a" },
  dimetrodon: { file: "fire_salamander", height: 2.2, tint: "#c07a4a" },
  kaprosuchus: { file: "crocodile", height: 1.4, tint: "#8a9a6a" },
  sarco: { file: "crocodile", height: 1.5 },
  beelzebufo: { file: "frog", height: 1.6 },
  leech: { file: "earthworm", height: 0.25, tint: "#5a3030" },
  meganeura: { file: "dragonfly", height: 0.8 },
  diplocaulus: { file: "gecko", height: 0.8 },
  baryonyx: { file: "tyrannosaur", height: 3.5, tint: "#70a0a0" },
  arthropleura: { file: "centipede", height: 0.6 },
  pulmonoscorpius: { file: "scorpion", height: 1.3 },
  megalania: { file: "fire_salamander", height: 1.6 },
  brontosaurus: { file: "apatosaurus", height: 14 },
  diplodocus: { file: "diplodocus", height: 6 },
  iguanodon: { file: "parasaurolophus", height: 3.5, tint: "#90a870", tintMaterials: ["Green", "LightGreen"] },
};
