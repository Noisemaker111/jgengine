/**
 * The design brief every game writes in its `PLAN.md` before code, read as data.
 *
 * The brief is the one place a game says what it is for the player over seconds, minutes and hours,
 * and the numbers the from-zero proof and the depth check hold it to. Its shape:
 *
 *   ## Design brief
 *
 *   - Core loop: the 30-second action
 *   - Session loop: the 10-minute goal
 *   - Long loop: hours of progression
 *   - Second 0: what the player has at the start, and why
 *   - Onboarding: how the game teaches
 *   - Pace: something new every 2 minutes
 *   - Longest cycle: 40 minutes, one season
 *   - Minutes to see everything: 900
 *
 *   ### First 10 minutes
 *
 *   - 0:00 wake on the beach with nothing; teaches moving and punching trees
 *   - 1:30 ten wood; unlocks the stone pick
 *   - ...
 *
 *   ### Start state
 *
 *   | Probe | At most |
 *   | --- | --- |
 *   | itemsSeen | 0 |
 *
 *   ### Content budget
 *
 *   | Kind | Count |
 *   | --- | --- |
 *   | items | 116 |
 *
 *   ### Systems
 *
 *   | System | Probe |
 *   | --- | --- |
 *   | harvesting | harvested |
 *
 * Every kind in the content budget is a pair of probe readings, `<kind>Seen` (distinct ones the player
 * has met) and `<kind>Total` (how many the game has). Every system names the probe reading that moves
 * when the player uses it. `taught` and `unlocks` are readings every game reports: tutorial beats the
 * player has done, and things opened to them.
 */

/** The labelled lines of a brief, in the order a reader meets them. */
export const BRIEF_LINES = [
  { id: "coreLoop", label: "Core loop", asks: "the 30-second action" },
  { id: "sessionLoop", label: "Session loop", asks: "the 10-minute goal" },
  { id: "longLoop", label: "Long loop", asks: "the hours of progression" },
  { id: "secondZero", label: "Second 0", asks: "what the player has at the start, and why" },
  { id: "onboarding", label: "Onboarding", asks: "how the game teaches" },
  { id: "pace", label: "Pace", asks: "something new every <n> minutes" },
  { id: "longestCycle", label: "Longest cycle", asks: "<n> minutes, the longest real-time cycle" },
  { id: "minutesOfContent", label: "Minutes to see everything", asks: "<n>" },
] as const;

type BriefLineId = (typeof BRIEF_LINES)[number]["id"];

/** One beat of the first ten minutes. */
export interface Beat {
  /** Seconds into play. */
  at: number;
  text: string;
}

export interface DesignBrief {
  /** The labelled lines' text, by id. */
  lines: ReadonlyMap<BriefLineId, string>;
  /** Minutes between new things, at most. */
  paceMinutes: number;
  /** The longest real-time cycle, in minutes. */
  longestCycleMinutes: number;
  /** Estimated minutes until a player has seen everything. */
  minutesOfContent: number;
  beats: Beat[];
  /** Probe reading -> the most it may read at second 0. */
  startState: Map<string, number>;
  /** Content kind -> how many the game promises. */
  budget: Map<string, number>;
  /** System -> the probe reading that moves when the player uses it. */
  systems: Map<string, string>;
}

/** The readings every game's probe reports for the from-zero proof and the depth check. */
export const TAUGHT_PROBE = "taught";
export const UNLOCKS_PROBE = "unlocks";

/** The probe readings a content kind is measured by. */
export function seenProbe(kind: string): string {
  return `${kind}Seen`;
}
export function totalProbe(kind: string): string {
  return `${kind}Total`;
}

/** The fewest of each part a brief may have. */
export const BRIEF_MINIMUMS = {
  beats: 5,
  /** The last beat is at least this far in, so the brief really plans ten minutes. */
  lastBeatSeconds: 8 * 60,
  /** A beat that teaches or unlocks something comes by this second. */
  firstTeachSeconds: 2 * 60,
  budgetKinds: 3,
  systems: 4,
} as const;

/** The heading a brief lives under in `PLAN.md`. */
export const BRIEF_HEADING = "## Design brief";

const BEAT = /^-\s*(\d{1,2}):([0-5]\d)\b\s*[-—:]?\s*(.*)$/;
const TEACHES = /\b(?:teach(?:es|ing)?|unlock(?:s|ing)?)\b/i;

/** The text of one `##` section (its heading line excluded), or `null` when the heading is absent. */
function section(text: string, heading: string, level: "##" | "###"): string | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ") || (level === "###" && trimmed.startsWith("### "))) break;
    out.push(line);
  }
  return out.join("\n");
}

/** Rows of the first markdown table in `text`, header and divider dropped. */
function tableRows(text: string): string[][] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim().replace(/^`|`$/g, "")));
  return rows.slice(2);
}

/** The first number in a line, or `null`. */
function firstNumber(text: string): number | null {
  const match = /(\d+(?:\.\d+)?)/.exec(text.replace(/,(?=\d{3}\b)/g, ""));
  return match === null ? null : Number(match[1]);
}

export type BriefRead = { ok: true; brief: DesignBrief } | { ok: false; problems: string[] };

/** Read and check a game's brief from its `PLAN.md` text. Every problem is named, not just the first. */
export function readDesignBrief(plan: string): BriefRead {
  const body = section(plan, BRIEF_HEADING, "##");
  if (body === null) return { ok: false, problems: [`has no "${BRIEF_HEADING}" section in PLAN.md`] };
  const problems: string[] = [];

  const lines = new Map<BriefLineId, string>();
  for (const line of BRIEF_LINES) {
    const match = new RegExp(`^-\\s*\\**${line.label}\\**\\s*[:—-]\\s*(.+)$`, "mi").exec(body);
    const value = match?.[1]?.trim() ?? "";
    if (value.length === 0) problems.push(`brief has no "- ${line.label}: ..." line (${line.asks})`);
    lines.set(line.id, value);
  }
  const number = (id: BriefLineId, label: string): number => {
    const value = lines.get(id) ?? "";
    if (value.length === 0) return 0;
    const parsed = firstNumber(value);
    if (parsed === null) problems.push(`brief "${label}" names no number of minutes ("${value}")`);
    return parsed ?? 0;
  };
  const paceMinutes = number("pace", "Pace");
  const longestCycleMinutes = number("longestCycle", "Longest cycle");
  const minutesOfContent = number("minutesOfContent", "Minutes to see everything");

  const beatsText = section(body, "### First 10 minutes", "###");
  const beats: Beat[] = [];
  if (beatsText === null) {
    problems.push('brief has no "### First 10 minutes" list of timed beats');
  } else {
    for (const line of beatsText.split(/\r?\n/)) {
      const match = BEAT.exec(line.trim());
      if (match === null) continue;
      beats.push({ at: Number(match[1]) * 60 + Number(match[2]), text: match[3] ?? "" });
    }
    if (beats.length < BRIEF_MINIMUMS.beats) problems.push(`brief's first 10 minutes has ${beats.length} timed beats ("- m:ss ..."); it needs at least ${BRIEF_MINIMUMS.beats}`);
    if (beats.some((beat, index) => index > 0 && beat.at < (beats[index - 1]?.at ?? 0))) problems.push("brief's first-10-minute beats are not in time order");
    const last = beats.at(-1);
    if (last !== undefined && last.at < BRIEF_MINIMUMS.lastBeatSeconds) problems.push(`brief's last beat is at ${clock(last.at)}; plan the first 10 minutes to at least ${clock(BRIEF_MINIMUMS.lastBeatSeconds)}`);
    if (!beats.some((beat) => beat.at <= BRIEF_MINIMUMS.firstTeachSeconds && TEACHES.test(beat.text))) {
      problems.push(`brief has no beat by ${clock(BRIEF_MINIMUMS.firstTeachSeconds)} that teaches or unlocks something`);
    }
    const silent = beats.filter((beat) => !TEACHES.test(beat.text));
    if (silent.length > 0) problems.push(`brief beats ${silent.map((beat) => clock(beat.at)).join(", ")} say neither what is taught nor what unlocks`);
  }

  const startState = new Map<string, number>();
  const startText = section(body, "### Start state", "###");
  if (startText === null) problems.push('brief has no "### Start state" table (probe reading | at most)');
  else {
    for (const [key, value] of tableRows(startText)) {
      const cap = firstNumber(value ?? "");
      if (key === undefined || key.length === 0 || cap === null) problems.push(`brief start-state row "${key ?? ""} | ${value ?? ""}" needs a probe reading and a number`);
      else startState.set(key, cap);
    }
    if (startState.size === 0) problems.push("brief's start-state table has no rows; name what the player holds at second 0");
  }

  const budget = new Map<string, number>();
  const budgetText = section(body, "### Content budget", "###");
  if (budgetText === null) problems.push('brief has no "### Content budget" table (kind | count)');
  else {
    for (const [kind, value] of tableRows(budgetText)) {
      const count = firstNumber(value ?? "");
      if (kind === undefined || !/^[a-z][A-Za-z0-9]*$/.test(kind) || count === null) problems.push(`brief content-budget row "${kind ?? ""} | ${value ?? ""}" needs a one-word kind (lowercase first letter) and a count`);
      else budget.set(kind, count);
    }
    if (budget.size < BRIEF_MINIMUMS.budgetKinds) problems.push(`brief's content budget names ${budget.size} kinds; it needs at least ${BRIEF_MINIMUMS.budgetKinds} (verbs, items, areas...)`);
  }

  const systems = new Map<string, string>();
  const systemsText = section(body, "### Systems", "###");
  if (systemsText === null) problems.push('brief has no "### Systems" table (system | probe reading)');
  else {
    for (const [name, probe] of tableRows(systemsText)) {
      if (name === undefined || name.length === 0 || probe === undefined || probe.length === 0) problems.push(`brief systems row "${name ?? ""} | ${probe ?? ""}" needs a system and the probe reading it moves`);
      else systems.set(name, probe);
    }
    if (systems.size < BRIEF_MINIMUMS.systems) problems.push(`brief names ${systems.size} systems; it needs at least ${BRIEF_MINIMUMS.systems}`);
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, brief: { lines, paceMinutes, longestCycleMinutes, minutesOfContent, beats, startState, budget, systems } };
}

/** `m:ss`. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
