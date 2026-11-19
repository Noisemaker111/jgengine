import { hashString } from "../random/rng";
import type { PlayValue } from "./script";

export type PlayTimelineKind = "step" | "command" | "event" | "check";

export interface PlayTimelineEntry {
  tick: number;
  kind: PlayTimelineKind;
  label: string;
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
  value: PlayValue;
}

export interface PlayRunResult {
  seed: string | number;
  /** Fixed tick length the run advanced in seconds. */
  dt: number;
  ticks: number;
  timeline: readonly PlayTimelineEntry[];
  expectations: readonly PlayExpectationResult[];
  passed: boolean;
  /** Deterministic hash of the timeline — equal digests mean two runs played identically. */
  digest: string;
}

export function playTimelineDigest(timeline: readonly PlayTimelineEntry[]): string {
  const text = JSON.stringify(timeline.map((entry) => [entry.tick, entry.kind, entry.label, entry.values ?? null]));
  return hashString(text).toString(16).padStart(8, "0");
}

function formatValue(value: PlayValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
  return String(value);
}

export function formatPlayTimelineEntry(entry: PlayTimelineEntry): string {
  const values = Object.entries(entry.values ?? {})
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
  return `t=${entry.tick} ${entry.kind} ${entry.label}${values === "" ? "" : ` ${values}`}`;
}
