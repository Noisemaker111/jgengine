import type { EncounterWave } from "./encounter";

export interface WavePreviewUnit {
  unit: string;
  count: number;
  /** Seconds into the wave its first group enters. */
  firstAt: number;
}

export interface WavePreview {
  id: string;
  label: string | null;
  /** Units the authored groups send, before pressure adds any; `elite` groups are left out unless asked for. */
  total: number;
  units: readonly WavePreviewUnit[];
  traits: Readonly<Record<string, number>>;
  entries: readonly string[];
}

export interface WavePreviewOptions {
  traitsOf?: (unit: string) => readonly string[];
  includeElite?: boolean;
}

/** @capability wave-preview summarize an authored wave before it opens: units by first arrival, trait counts and entries used */
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
