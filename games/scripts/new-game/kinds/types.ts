/**
 * What one kind of game is to the generator: the genre words that pick it, how it reads an idea into
 * its `idea.ts`, how it lays out the world, and the README, loop proof and clip it writes. The game
 * code itself lives in `template/<kind>/`; this is only the part that runs once, at generation.
 */
import type { BaseIdea, KindName } from "../template/common/src/game/ideaShape";
import type { Layout } from "../world/layout";

export interface FlowStep {
  [key: string]: unknown;
}

export interface Flow {
  steps: FlowStep[];
}

export interface ReadOptions {
  /** Overrides the picked name. */
  name?: string;
}

export interface KindModule<I extends BaseIdea = BaseIdea> {
  kind: KindName;
  /** The genre in a few words: "cozy farming and fishing". */
  genre: string;
  /**
   * Words and phrases that mean this genre. A phrase ("tower defense") counts double. The kind with
   * the most hits wins; ties and no-hit ideas go to `closest` below.
   */
  words: readonly string[];
  /** Read the idea's words into the kind's data; the theme (setting, models, words) is picked inside. */
  read(text: string, said: readonly string[], options: ReadOptions): I;
  /** Lay out the authored world: places, towns, forests, lakes, paths. */
  scene(idea: I, layout: Layout): void;
  /** The README design checklist. */
  readme(idea: I): string;
  /** The loop proof flow (`proofs/flows/<id>-loop.json`). */
  loopFlow(idea: I): Flow;
  /** A ~35 s clip route (`proofs/flows/<id>-clip.json`); `clipState` names the capture state it starts from. */
  clipFlow(idea: I): Flow;
  clipState?: string;
}
