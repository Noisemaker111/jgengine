/**
 * What a wave will bring, read from its authored data before it opens: how many of each unit, the
 * traits a player has to answer (flying, armored, healing), and which entries they use. A wave
 * preview card, a "next wave" tooltip and a balance test all read the same summary.
 */

import type { EncounterWave } from "./encounter";

/** One unit in a wave, totalled across its groups. */
export interface WavePreviewUnit {
  unit: string;
  count: number;
  /** Seconds into the wave its first group enters. */
  firstAt: number;
}

/** One authored wave summarized for a preview card. */
export interface WavePreview {
  id: string;
  label: string | null;
  /** Units the authored groups send, before pressure adds any; `elite` groups are left out unless asked for. */
  total: number;
  /** One row per unit, in order of first arrival, then id. */
  units: readonly WavePreviewUnit[];
  /** Trait → how many units carry it, from `traitsOf`. */
  traits: Readonly<Record<string, number>>;
  /** Entry ids the wave uses, in order of first use. */
  entries: readonly string[];
}

/** How {@link summarizeWave} reads traits and elite groups. */
export interface WavePreviewOptions {
  /** The traits a unit carries (`["flying"]`, `["armored", "healer"]`); omitted means none. */
  traitsOf?: (unit: string) => readonly string[];
  /** Count `elite` groups, which only enter when pressure unlocks a slot. Default `false`. */
  includeElite?: boolean;
}

/**
 * Summarize one authored wave for a preview.
 *
 * @capability wave-preview summarize an authored wave before it opens: units by first arrival, trait counts and entries used
 */
export function summarizeWave(wave: EncounterWave, options: WavePreviewOptions = {}): WavePreview {
  const rows = new Map<string, WavePreviewUnit>();
  const entries: string[] = [];
  const traits: Record<string, number> = {};
  let total = 0;
  for (const group of wave.groups) {
    if (group.elite === true && options.includeElite !== true) continue;
    const count = Math.max(0, Math.round(group.count ?? 1));
    if (count === 0) continue;
    const at = Math.max(0, group.at ?? 0);
    const row = rows.get(group.unit);
    if (row === undefined) rows.set(group.unit, { unit: group.unit, count, firstAt: at });
    else rows.set(group.unit, { unit: group.unit, count: row.count + count, firstAt: Math.min(row.firstAt, at) });
    if (!entries.includes(group.entry)) entries.push(group.entry);
    for (const trait of options.traitsOf?.(group.unit) ?? []) traits[trait] = (traits[trait] ?? 0) + count;
    total += count;
  }
  const units = [...rows.values()].sort((a, b) => a.firstAt - b.firstAt || (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0));
  return { id: wave.id, label: wave.label ?? null, total, units, traits, entries };
}
