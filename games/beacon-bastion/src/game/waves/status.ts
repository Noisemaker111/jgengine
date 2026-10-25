import type { EncounterWave } from "@jgengine/core/ai/director/encounter";

import { CREEP_CATALOG, creepName } from "../entities/enemies/catalog";
import { bossProfile } from "./manifest";

export interface WaveStatusInput {
  /** Whether the player has released at least one wave. */
  started: boolean;
  /** True while the current wave's release window is spawning raiders. */
  releasing: boolean;
  /** 1-based wave number shown to the player. */
  wave: number;
  /** Raiders currently alive on the approach. */
  alive: number;
}

/** One line for the wave widget that says what the field is doing right now. */
export function waveStatusLine({ started, releasing, wave, alive }: WaveStatusInput): string {
  if (!started) return `Wave ${wave} · ready to release`;
  if (alive === 0) return releasing ? `Wave ${wave} · raiders incoming` : `Wave ${wave} · field clear`;
  return `Wave ${wave} · ${alive} ${alive === 1 ? "raider" : "raiders"} left`;
}

/** How hard the director is leaning, in one word per pressure tier. */
export function tierLabel(tier: number): string {
  if (tier >= 2) return "hammering";
  if (tier === 1) return "leaning";
  return "probing";
}

/** One raider, or several of one kind, as the HUD names them. A named raider is never pluralised. */
function raiderPart(unit: string, count: number): string {
  const def = CREEP_CATALOG[unit];
  if (def === undefined) return count === 1 ? unit : `${count} ${unit}`;
  if (def.title !== undefined) return count === 1 ? creepName(unit) : `${count} ${def.label}s`;
  return count === 1 ? `${count} ${def.label}` : `${count} ${def.label}s`;
}

function compositionParts(wave: EncounterWave, skipBosses = false): string[] {
  const counts = new Map<string, number>();
  for (const group of wave.groups) {
    if (skipBosses && bossProfile(group.unit) !== null) continue;
    counts.set(group.unit, (counts.get(group.unit) ?? 0) + (group.count ?? 1));
  }
  return [...counts.entries()].map(([unit, count]) => raiderPart(unit, count));
}

/**
 * The wave the director actually sent, by unit: pressure-added units appear here because they are
 * in the composition, not in a separate note. Units are grouped and ordered by id so the line does
 * not shuffle between reads.
 */
export function waveCompositionLine(units: readonly string[], tier: number): string {
  if (units.length === 0) return `Director ${tierLabel(tier)} · no host on the field`;
  const counts = new Map<string, number>();
  for (const unit of units) counts.set(unit, (counts.get(unit) ?? 0) + 1);
  const parts = [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([unit, count]) => raiderPart(unit, count));
  return `Director ${tierLabel(tier)} · ${parts.join(", ")}`;
}

/**
 * What the next wave will be, before the player releases it. Composed waves are seeded, so this is
 * the same host the director will send, not an estimate; pressure may still thicken it.
 */
export function wavePreviewLine(wave: EncounterWave | null, waveNumber: number): string {
  if (wave === null) return "No further assault — hold the keep";
  const boss = wave.groups.find((group) => bossProfile(group.unit) !== null);
  const parts = compositionParts(wave, true);
  const label = wave.label === undefined ? `Wave ${waveNumber}` : `${wave.label}`;
  const bossPart = boss === undefined ? "" : ` · BOSS ${creepName(boss.unit)}`;
  return `Next · ${label} — ${parts.join(", ")}${bossPart}`;
}

/**
 * The 0-based index of the wave a release would send. Before the first release that is wave 1; once
 * a wave is open, releasing it clears it and opens the next one, so the preview moves up with it.
 */
export function nextWaveIndex(started: boolean, wave: number): number {
  return started ? Math.max(1, wave) : 0;
}

/** The boss on the field and the stance its phase sets, or null when no boss is out. */
export function bossLine(boss: { unitId: string; state: { phaseId: string; tellId: string | null } } | null): string | null {
  if (boss === null) return null;
  const profile = bossProfile(boss.unitId);
  if (profile === null) return null;
  const stance = profile.stance[boss.state.phaseId]?.label ?? boss.state.phaseId;
  const tell = boss.state.tellId === null ? "" : " (telegraphing)";
  return `${creepName(boss.unitId)} — ${stance}${tell}`;
}
