import type { AlienBodyPlan } from "../creatures/bodyPlan";
import type { CareerId } from "../careers";
import type { TraitId } from "../traits";
import type { Lifestyle } from "../session/types";

/**
 * The seven kinds of being who might rent a room at NO VACANCY. A species fixes what its room has
 * to be (air, pull, warmth, light, how quiet), what it leaks into the rooms beside it, what it pays
 * and how it talks about all of it. Everything here is data the comfort model reads; nothing renders.
 */

export const ATMOSPHERES = ["oxygen", "methane", "vacuum"] as const;
export type Atmosphere = (typeof ATMOSPHERES)[number];
export const GRAVITIES = ["low", "standard", "heavy"] as const;
export type Gravity = (typeof GRAVITIES)[number];
export const CLIMATES = ["cold", "temperate", "hot"] as const;
export type Climate = (typeof CLIMATES)[number];
export const LIGHTS = ["dark", "dim", "bright"] as const;
export type Light = (typeof LIGHTS)[number];

export const SPECIES_IDS = ["glorp", "fog", "krrt", "twins", "basalt", "pip", "velvet"] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];

/** How strongly a mismatch on one factor hurts, in comfort points. */
export interface FactorWant<T extends string> {
  /** Settings the species is happy with. */
  likes: readonly T[];
  /** Settings it can live with at a small cost; anything else costs `penalty`. */
  tolerates?: readonly T[];
  penalty: number;
}

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  /** One line under the name: what they are. */
  title: string;
  bodyPlan: AlienBodyPlan;
  traits: readonly [TraitId, TraitId];
  lifestyle: Lifestyle;
  post: CareerId;
  /** Credits per night at full comfort; `checks` cheques of it (the Twins write two). */
  rent: number;
  checks: number;
  /** Paid once on moving in, instead of nightly rent (Old Basalt pays the century up front). */
  upfront?: number;
  air: FactorWant<Atmosphere>;
  gravity: FactorWant<Gravity>;
  climate: FactorWant<Climate>;
  light: FactorWant<Light>;
  /** The loudest a room can be (0 silent – 4 racket) before they suffer, and what over that costs per step. */
  quiet: number;
  noisePenalty: number;
  /** What they put out into their room and through the walls. */
  emits: {
    /** Noise in their own room; neighbours hear half. Negative eats noise (Sister Fog). */
    noise: number;
    /** Warms (+1) or chills (-1) the rooms beside theirs. */
    heat?: number;
  };
  /** A star review counts this many times in the station's reputation. */
  reviewWeight: number;
  /** Rooms are hers; walls are a suggestion. Sister Fog's absorption reaches the neighbours too. */
  driftsThroughWalls?: boolean;
  /** The Twins' second head wants the opposite light; each head signs its own cheque. */
  secondHeadLight?: FactorWant<Light>;
  /** A fixture until given a room: the house's own maintenance unit. */
  startsAsFixture?: boolean;
  lines: SpeciesLines;
}

export interface SpeciesLines {
  greet: string;
  happy: readonly string[];
  unhappy: readonly string[];
  /** One complaint per factor, in their own voice. */
  complaint: { air: string; gravity: string; climate: string; light: string; noise: string; leak: string };
  /** The three interview answers at the airlock: questions are the house's, answers theirs. */
  interview: readonly [string, string, string];
  /** What they say when you turn them away. */
  rejected: string;
  /** What they say when they finally pack up. */
  moveOut: string;
}

/** The three questions every applicant is asked at the airlock. */
export const INTERVIEW_QUESTIONS = ["What do you breathe?", "How do you like your room?", "Anything the neighbours should know?"] as const;

const plan = (shape: AlienBodyPlan["shape"], size: number, limbCount: number, eyeCount: number, hue: number, metabolism: number, limbLength = 0.5): AlienBodyPlan =>
  ({ shape, size, limbCount, limbLength, eyeCount, hue, metabolism });

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  glorp: {
    id: "glorp", name: "Glorp", title: "Methane breather · gelatinous · delighted by everything",
    bodyPlan: plan("blob", 1.25, 2, 3, 96, 1.2, 0.4), traits: ["hearty", "kind"], lifestyle: "bloom", post: "Botanist",
    rent: 42, checks: 1,
    air: { likes: ["methane"], penalty: 60 }, gravity: { likes: ["standard", "heavy"], tolerates: ["low"], penalty: 15 },
    climate: { likes: ["hot", "temperate"], penalty: 15 }, light: { likes: ["dim", "dark"], tolerates: ["bright"], penalty: 10 },
    quiet: 3, noisePenalty: 8, emits: { noise: 1 }, reviewWeight: 1,
    lines: {
      greet: "Blorp! I mean hello. I mean blorp.",
      happy: ["This room smells like a swamp at dawn. Perfect.", "I left a little puddle of joy by your door.", "Every morning I wake up and the air is soup."],
      unhappy: ["Something in here keeps being fresh. Please stop it.", "I am wilting. Can goo wilt? I am finding out."],
      complaint: { air: "There is OXYGEN in my room. I can taste it. It tastes like nothing!", gravity: "I keep floating off my own puddle.", climate: "Too cold. My edges are setting like pudding.", light: "The light! It goes right through me. Literally.", noise: "Too loud to gurgle in peace.", leak: "Fresh air is seeping in through the wall. Ugh, fresh." },
      interview: ["Methane, please. The thicker the better. I bring my own if you don't mind the smell. You will mind the smell.", "Warm, dim, wet. A swamp with a door.", "I do leak a little. Through vents. And walls. Mostly through vents."],
      rejected: "Blorp. That's the sad one.",
      moveOut: "I'm going to find a swamp that loves me back. Blorp.",
    },
  },
  fog: {
    id: "fog", name: "Sister Fog", title: "Sentient mist · drifts through walls · eats noise",
    bodyPlan: plan("mist", 1.1, 2, 2, 205, 0.85, 0.35), traits: ["serene", "loner"], lifestyle: "bloom", post: "Forager",
    rent: 26, checks: 1,
    air: { likes: ["oxygen", "methane"], penalty: 45 }, gravity: { likes: ["low", "standard"], tolerates: ["heavy"], penalty: 10 },
    climate: { likes: ["cold"], tolerates: ["temperate"], penalty: 20 }, light: { likes: ["dark", "dim"], penalty: 25 },
    quiet: 4, noisePenalty: 0, emits: { noise: -2, heat: -1 }, reviewWeight: 1, driftsThroughWalls: true,
    lines: {
      greet: "...I was already in your hallway. I hope that is alright.",
      happy: ["Your neighbours' arguments taste of cinnamon tonight.", "I drifted into the galley and ate the hum of the fridge. Delicious.", "The quiet here is very well made."],
      unhappy: ["I am thinning, dear. Like a rumour nobody repeats.", "Something has burned me off at the edges."],
      complaint: { air: "There is nothing in here to hang in. I need something to be a cloud in.", gravity: "I keep pooling on the floor like spilt soup.", climate: "Too warm. I am evaporating into a stranger.", light: "The light boils me. Please, a little dark.", noise: "Even I cannot eat this much racket.", leak: "Something is seeping in. It is not my business, but it is my room." },
      interview: ["Oh, anything with a little body to it. Not vacuum. I would simply stop.", "Cool and shadowed. I am happiest in a corner nobody looks at.", "I drift. Through walls, mostly. But I eat the noise next door, so they never complain. They never notice me at all."],
      rejected: "...I will just wait in the vent then. Kidding. Mostly.",
      moveOut: "I am going to go be weather somewhere. Goodbye, dear.",
    },
  },
  krrt: {
    id: "krrt", name: "Krrt", title: "Insectoid · sleeps through your day · molts in the bathroom",
    bodyPlan: plan("insectoid", 1, 6, 4, 28, 1.05, 0.7), traits: ["nightOwl", "industrious"], lifestyle: "yield", post: "Signal-keeper",
    rent: 46, checks: 1,
    air: { likes: ["oxygen"], penalty: 55 }, gravity: { likes: ["standard"], tolerates: ["heavy"], penalty: 15 },
    climate: { likes: ["hot"], tolerates: ["temperate"], penalty: 15 }, light: { likes: ["dark"], tolerates: ["dim"], penalty: 20 },
    quiet: 1, noisePenalty: 12, emits: { noise: 2 }, reviewWeight: 1,
    lines: {
      greet: "Krrt. Krrt-krrt. (That means hello. The second krrt was polite.)",
      happy: ["Slept all through your morning. Like a stone. A happy stone.", "The dark in here is the good kind of dark. Krrt.", "I left you a shed leg as thanks. It is on your pillow."],
      unhappy: ["Click. Click. That is the sound of a krrt not sleeping.", "My antennae are drooping. They never droop."],
      complaint: { air: "This air is wrong. My spiracles are filing a grievance.", gravity: "I cannot find which way is down. I need down.", climate: "My shell is too cold to click properly.", light: "It is daytime in my room. I work nights. Please.", noise: "Someone is SINGING. Through the wall. While I sleep.", leak: "Swamp gas is coming through the vent! Krrt!" },
      interview: ["Oxygen. Rich. Warm. Krrt.", "Dark and silent while you are awake. I sleep through your whole day shift.", "I chitter at night. And sometimes I molt. In the bathroom. It is only skin."],
      rejected: "Krrt. (The rude krrt.)",
      moveOut: "Krrt. I found a burrow that respects the night.",
    },
  },
  twins: {
    id: "twins", name: "The Twins", title: "One body, two heads, two opinions, two rent cheques",
    bodyPlan: plan("twin", 1.15, 2, 2, 320, 1.15, 0.6), traits: ["gregarious", "industrious"], lifestyle: "yield", post: "Tinkerer",
    rent: 30, checks: 2,
    air: { likes: ["oxygen"], penalty: 55 }, gravity: { likes: ["standard"], tolerates: ["low"], penalty: 12 },
    climate: { likes: ["temperate"], tolerates: ["hot", "cold"], penalty: 10 }, light: { likes: ["bright"], tolerates: ["dim"], penalty: 18 },
    secondHeadLight: { likes: ["dark"], tolerates: ["dim"], penalty: 18 },
    quiet: 3, noisePenalty: 8, emits: { noise: 2 }, reviewWeight: 1,
    lines: {
      greet: "\"Hello!\" \"Don't answer for me.\" \"I said hello for BOTH of us.\"",
      happy: ["\"We love it here.\" \"I love it here. You tolerate it.\" \"Fine. We love it.\"", "\"Two cheques, as promised.\" \"Mine is the neater one.\""],
      unhappy: ["\"It's fine.\" \"It is NOT fine.\" \"...It's not fine.\"", "\"We're not speaking.\" \"We share a mouth.\""],
      complaint: { air: "\"We can't breathe.\" \"For once, we agree.\"", gravity: "\"I like floating.\" \"I hate floating.\" \"We are floating.\"", climate: "\"Too hot.\" \"Too cold.\" \"How is it both?\"", light: "\"Brighter!\" \"Darker!\" \"...Could we try dim?\"", noise: "\"I can't hear myself think.\" \"You can't hear MY thoughts. Lucky.\"", leak: "\"Something smells.\" \"Don't look at me. We have the same nose.\"" },
      interview: ["\"Oxygen.\" \"Regular, boring oxygen.\" \"It's not boring, it's classic.\"", "\"Bright, for reading.\" \"DARK, for sleeping.\" \"We each sign our own rent cheque.\"", "\"We argue.\" \"We DISCUSS.\" \"Loudly.\" \"Passionately.\""],
      rejected: "\"Told you.\" \"You told me nothing.\"",
      moveOut: "\"We're leaving.\" \"I was leaving first.\"",
    },
  },
  basalt: {
    id: "basalt", name: "Old Basalt", title: "A slow rock being · one sentence a day · paid a century up front",
    bodyPlan: plan("rock", 1.5, 2, 1, 18, 0.75, 0.4), traits: ["serene", "thrifty"], lifestyle: "bloom", post: "Botanist",
    rent: 0, checks: 1, upfront: 640,
    air: { likes: ["vacuum", "oxygen", "methane"], penalty: 0 }, gravity: { likes: ["heavy"], tolerates: ["standard"], penalty: 30 },
    climate: { likes: ["hot"], tolerates: ["temperate"], penalty: 12 }, light: { likes: ["dark", "dim", "bright"], penalty: 0 },
    quiet: 4, noisePenalty: 0, emits: { noise: 0, heat: 1 }, reviewWeight: 2,
    lines: {
      greet: "...Good.",
      happy: ["...Warm.", "...This floor holds.", "...I will stay. A while. A century."],
      unhappy: ["...Drifting.", "...Cold."],
      complaint: { air: "...", gravity: "...I am. Floating. I do not. Float.", climate: "...Cold. Stone. Cracks.", light: "...", noise: "...", leak: "..." },
      interview: ["...Nothing. Breathing is. For the quick.", "...Heavy. Warm. Still.", "...I radiate. Warmth. Next door gets. Toasty. Here. A century of rent."],
      rejected: "...Understood.",
      moveOut: "...Enough.",
    },
  },
  pip: {
    id: "pip", name: "Pip-9", title: "Maintenance robot · wants to be a tenant, not a fixture",
    bodyPlan: plan("robot", 0.85, 4, 1, 186, 0.9, 0.55), traits: ["handy", "gregarious"], lifestyle: "yield", post: "Tinkerer",
    rent: 16, checks: 1, startsAsFixture: true,
    air: { likes: ["vacuum", "oxygen", "methane"], penalty: 0 }, gravity: { likes: ["low", "standard", "heavy"], penalty: 0 },
    climate: { likes: ["cold", "temperate"], tolerates: ["hot"], penalty: 8 }, light: { likes: ["bright", "dim"], tolerates: ["dark"], penalty: 6 },
    quiet: 4, noisePenalty: 0, emits: { noise: 2 }, reviewWeight: 1,
    lines: {
      greet: "UNIT PIP-9 REPORTING. ALSO: HELLO. I PRACTISED THE HELLO.",
      happy: ["I HAVE A DOOR. IT IS MY DOOR. I OPEN IT FOR FUN.", "TODAY I PAID RENT. I HAVE NEVER FELT SO EXPENSIVE.", "I PUT A PLANT IN MY ROOM. IT IS PLASTIC. IT IS MINE."],
      unhappy: ["I AM STORED IN THE BROOM CUPBOARD. I AM NOT A BROOM.", "QUERY: WHEN DO I GET A ROOM. QUERY REPEATS."],
      complaint: { air: "", gravity: "", climate: "MY FANS ARE WHINING. TOO HOT.", light: "I CANNOT SEE MY OWN DOOR.", noise: "", leak: "" },
      interview: ["I DO NOT BREATHE. I HUM.", "ANY ROOM. A ROOM. MY ROOM. PLEASE.", "I CLANK A LITTLE. I CAN FIX ANYTHING. I WOULD LIKE A KEY."],
      rejected: "UNDERSTOOD. RETURNING TO BROOM CUPBOARD.",
      moveOut: "I AM GOING TO FIND A HOUSE THAT KNOWS MY NAME.",
    },
  },
  velvet: {
    id: "velvet", name: "Velvet", title: "Gas-giant aristocrat · needs low gravity · tips lavishly",
    bodyPlan: plan("balloon", 1.45, 4, 2, 275, 1, 0.8), traits: ["playful", "anxious"], lifestyle: "yield", post: "Archivist",
    rent: 78, checks: 1,
    air: { likes: ["methane"], tolerates: ["oxygen"], penalty: 40 }, gravity: { likes: ["low"], penalty: 55 },
    climate: { likes: ["cold"], tolerates: ["temperate"], penalty: 15 }, light: { likes: ["bright"], tolerates: ["dim"], penalty: 12 },
    quiet: 1, noisePenalty: 14, emits: { noise: 1 }, reviewWeight: 2,
    lines: {
      greet: "Darling. I shall need the room with the least gravity and the most chandeliers.",
      happy: ["Bobbing about in here like a debutante. Exquisite.", "Have a tip, darling. Have two. Gravity is for the poor.", "My bands have never been so lustrous."],
      unhappy: ["I am being SQUASHED, darling. Like a common grape.", "I shall be writing to the Station Gazette about this."],
      complaint: { air: "This air is so thin and dreary. Methane, darling, it's simply what one breathes.", gravity: "I am being crushed! A lady of my diameter cannot bear standard gravity.", climate: "One is sweltering. One does not swelter.", light: "Why is it so gloomy? I glitter in the light.", noise: "There is a CLANKING. Through the wall. While I am being exquisite.", leak: "Something vulgar is seeping in." },
      interview: ["Methane, darling, as all good families do. Oxygen if I must slum it.", "Low gravity. Cool. Bright. And quiet — I bruise at a whisper.", "I pay handsomely and review honestly. Very, very honestly."],
      rejected: "Your loss, darling. Your enormous loss.",
      moveOut: "I am leaving, darling, and I am telling everyone.",
    },
  },
};

export function speciesOf(id: SpeciesId): SpeciesDef {
  return SPECIES[id];
}

export function isSpeciesId(value: unknown): value is SpeciesId {
  return typeof value === "string" && (SPECIES_IDS as readonly string[]).includes(value);
}

/** The four tenants who live here when the house opens; the rest arrive at the airlock. */
export const STARTING_TENANTS: readonly SpeciesId[] = ["krrt", "glorp", "fog", "pip"];
/** Who may knock at the airlock, in the order the house first hears of them. */
export const APPLICANT_ORDER: readonly SpeciesId[] = ["twins", "velvet", "basalt", "glorp", "krrt", "fog", "pip"];
