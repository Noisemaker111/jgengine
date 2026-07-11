export type Mark = "blank" | "fill" | "cross";

export type Clue = readonly number[];

export type Grid = readonly (readonly boolean[])[];

export type SizeGroup = "5×5" | "10×10" | "15×15";

export interface PuzzleSpec {
  readonly id: string;
  readonly name: string;
  readonly group: SizeGroup;
  readonly size: number;
  readonly art: readonly string[];
  readonly palette: Readonly<Record<string, string>>;
}

export interface Puzzle {
  readonly id: string;
  readonly name: string;
  readonly group: SizeGroup;
  readonly size: number;
  readonly solution: Grid;
  readonly colors: readonly (readonly (string | null)[])[];
  readonly rowClues: readonly Clue[];
  readonly colClues: readonly Clue[];
}
