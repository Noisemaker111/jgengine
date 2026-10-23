import type { PlayValue } from "./script";

/** What a timeline row records: a scripted action, a command result, a world event, or an assertion reading. */
export type PlayTimelineKind = "step" | "command" | "event" | "check";

/** One row of what happened, on the tick it happened. */
export interface PlayTimelineEntry {
  tick: number;
  kind: PlayTimelineKind;
  /** The action, command, event name or assertion id. */
  label: string;
  /** The numbers behind the row: a health, a distance, a wave number, a status. */
  values?: Readonly<Record<string, PlayValue>>;
}

/** One assertion's verdict, with both readings so a failure says what changed and by how much. */
export interface PlayExpectationResult {
  id: string;
  subject: string;
  tick: number;
  pass: boolean;
  /** The reading taken right after `setup`, before the script's steps ran. */
  initial: PlayValue;
  /** The reading on the assertion's own tick. */
  value: PlayValue;
}

/** Everything a scripted run produced: the timeline, the assertion verdicts, and a digest of the timeline for replay comparison. */
export interface PlayRunResult {
  seed: string | number;
  /** Fixed tick length the run advanced in seconds. */
  dt: number;
  ticks: number;
  timeline: readonly PlayTimelineEntry[];
  expectations: readonly PlayExpectationResult[];
  /** True when every expectation passed. */
  passed: boolean;
  /** Deterministic hash of the timeline — equal digests mean two runs played identically. */
  digest: string;
}

/**
 * FNV-1a over the timeline's canonical JSON. Cheap, dependency-free and stable across runs and
 * machines, which is all a replay comparison needs.
 */
export function playTimelineDigest(timeline: readonly PlayTimelineEntry[]): string {
  const text = JSON.stringify(timeline.map((entry) => [entry.tick, entry.kind, entry.label, entry.values ?? null]));
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function formatValue(value: PlayValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
  return String(value);
}

/** One compact timeline line: `t=120 event combat.damage to=bruiser amount=12 remaining=54`. */
export function formatPlayTimelineEntry(entry: PlayTimelineEntry): string {
  const values = Object.entries(entry.values ?? {})
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
  return `t=${entry.tick} ${entry.kind} ${entry.label}${values === "" ? "" : ` ${values}`}`;
}
