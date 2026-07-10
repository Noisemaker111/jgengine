const START_LINES: readonly string[] = ["GREEN LIGHT — GO GO GO!", "AND THEY'RE OFF INTO THE VOID!"];

const LAP_LINES: readonly string[] = [
  "LAP {lap} — CHASE THE GRAVITY!",
  "LAP {lap} — RIDE THE WELLS!",
  "LAP {lap} — LOOKING LIKE THE LAP OF THE CENTURY!",
];

const CLEAN_SLING_LINES: readonly string[] = [
  "AND SHE SLINGS PAST {planet}!",
  "CLEAN SLING OFF {planet} — LISTEN TO THAT CROWD!",
  "A TEXTBOOK RELEASE FROM {planet}!",
];

const OVERTAKE_LINES: readonly string[] = ["SHE TAKES P{position}!", "THE PASS IS MADE — UP TO P{position}!"];

const WIN_LINE = "LAP OF THE CENTURY — CHECKERED ORBIT TAKEN!";
const LOSE_LINE = "SIGNAL LOST — DRIFTING OUT OF CONTENTION.";
const TIMEOUT_LINE = "TELEMETRY DARK — SHE NEVER FOUND THE LINE.";

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function pick(pool: readonly string[], index: number): string {
  return pool[index % pool.length]!;
}

export function startLine(index: number): string {
  return pick(START_LINES, index);
}

export function lapLine(index: number, lap: number): string {
  return fill(pick(LAP_LINES, index), { lap: String(lap) });
}

export function cleanSlingLine(index: number, planetName: string): string {
  return fill(pick(CLEAN_SLING_LINES, index), { planet: planetName });
}

export function overtakeLine(index: number, position: number): string {
  return fill(pick(OVERTAKE_LINES, index), { position: String(position) });
}

export function winLine(): string {
  return WIN_LINE;
}

export function loseLine(): string {
  return LOSE_LINE;
}

export function timeoutLine(): string {
  return TIMEOUT_LINE;
}
