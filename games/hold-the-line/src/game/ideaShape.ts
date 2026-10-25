/**
 * The shared shape of `idea.ts`: what every generated game has whatever its kind (name, look, the
 * ground and sky, the UI kit). Each kind adds its own fields in `kindShape.ts`. `bun run new-game`
 * writes `idea.ts` from a plain-words idea; change a word, a cost or a model there and the game follows.
 */

export type KindName = "survival" | "racer" | "builder" | "defense" | "farm" | "shooter" | "colony" | "explorer";
export type UiKitName = "ink" | "paper" | "parchment" | "terminal" | "holo" | "broadcast" | "arcade" | "signal";
export type LookName = "cinematic" | "photoreal" | "toon" | "comic" | "retro";
export type MoodName = "day" | "bright" | "golden" | "dusk" | "overcast" | "night";
export type GroundName = "grass" | "sand" | "snow" | "rock" | "ash" | "highland" | "slate";

/** The ground's palette: the terrain material and its low and high colours. */
export interface GroundWord {
  material: GroundName;
  low: string;
  high: string;
}

/** A model: a file the game serves (`/models/...`), or a model library name (`nature/boulder`). */
export interface ModelRef {
  model: string;
  /** Metres tall once drawn; omit to keep the model's own size. */
  height?: number;
  /** A colour multiplied over the model's own (a sickly green turns a passer-by into the infected). */
  tint?: string;
}

/**
 * The land and the sky: how hilly the ground is, where the water sits, what the foliage regions are
 * drawn with, and the day the sun runs through. Places (forests, towns, lakes, paths) live in
 * `editor.scene.json`; this is only how they are drawn.
 */
export interface WorldWord {
  /** Hill height in metres (terrain noise amplitude); 0 is flat. */
  relief: number;
  /** Hill size: lower is broader. */
  frequency: number;
  /** Ground height water fills to; lakes in the scene sit at this level. */
  waterLevel: number;
  /** Scatter palette item -> model, for every foliage and rock region in the scene. */
  scatter: Readonly<Record<string, ModelRef>>;
  sky: {
    /** The look when the clock is off, and the look the day starts in. */
    preset: "day" | "dusk" | "night";
    /** Run the sun through a day; off holds `preset`. */
    cycle: boolean;
    /** Seconds of play in one in-world day. */
    dayLength: number;
    /** Hour of day the game starts at (0-24). */
    startHour: number;
    /** Haze across the distance, 0 (clear) to 1. */
    haze: number;
  };
}

/** One story beat: reach a fact, then the next beat starts by itself. */
export interface BeatWord {
  id: string;
  title: string;
  goal: string;
  fact: string;
  atLeast: number;
  pitch: string;
}

/** What every idea carries, whatever kind of game it is. */
export interface BaseIdea {
  kind: KindName;
  id: string;
  spec: string;
  name: string;
  pitch: string;
  tagline: string;
  kit: UiKitName;
  look: LookName;
  mood: MoodName;
  accent: string;
  ground: GroundWord;
  world: WorldWord;
  guide: { name: string; title: string };
}
