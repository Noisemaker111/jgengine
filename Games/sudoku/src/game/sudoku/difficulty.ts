export type Difficulty = "easy" | "medium" | "hard" | "expert";
export type Technique = "naked" | "hidden" | "any";

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];

export interface DiffConfig {
  id: Difficulty;
  label: string;
  /** Floor the digger aims for; fewer givens = harder. */
  targetGivens: number;
  /**
   * Technique tier a removal must preserve. `naked`/`hidden` keep the puzzle
   * solvable by that single-technique set (Easy/Medium); `any` only enforces a
   * unique solution, so the puzzle may demand deeper logic (Hard/Expert).
   */
  technique: Technique;
}

export const DIFF_CONFIG: Record<Difficulty, DiffConfig> = {
  easy: { id: "easy", label: "Easy", targetGivens: 40, technique: "naked" },
  medium: { id: "medium", label: "Medium", targetGivens: 32, technique: "hidden" },
  hard: { id: "hard", label: "Hard", targetGivens: 29, technique: "any" },
  expert: { id: "expert", label: "Expert", targetGivens: 24, technique: "any" },
};

export function difficultyLabel(d: Difficulty): string {
  return DIFF_CONFIG[d].label;
}
