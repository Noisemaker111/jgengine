export type DifficultyId = "ash-rookie" | "basalt-veteran" | "magma-overlord";

export interface DifficultyPreset {
  id: DifficultyId;
  label: string;
  tagline: string;
  decisionIntervalSeconds: number;
  aimErrorRadius: number;
  throwCooldownSeconds: number;
  moveSpeedMultiplier: number;
  defendRadius: number;
}

export const DIFFICULTY_PRESETS: readonly DifficultyPreset[] = [
  {
    id: "ash-rookie",
    label: "Ash Rookie",
    tagline: "Fresh off the crater bus — slow reads, loose aim.",
    decisionIntervalSeconds: 0.95,
    aimErrorRadius: 3.2,
    throwCooldownSeconds: 1.7,
    moveSpeedMultiplier: 0.82,
    defendRadius: 12,
  },
  {
    id: "basalt-veteran",
    label: "Basalt Veteran",
    tagline: "Reads the pitch, punishes loose balls.",
    decisionIntervalSeconds: 0.6,
    aimErrorRadius: 1.5,
    throwCooldownSeconds: 1.15,
    moveSpeedMultiplier: 1,
    defendRadius: 14,
  },
  {
    id: "magma-overlord",
    label: "Magma Overlord",
    tagline: "Sudden death is its home turf.",
    decisionIntervalSeconds: 0.32,
    aimErrorRadius: 0.5,
    throwCooldownSeconds: 0.7,
    moveSpeedMultiplier: 1.18,
    defendRadius: 16,
  },
];

export const DEFAULT_DIFFICULTY: DifficultyId = "basalt-veteran";

export function difficultyById(id: DifficultyId): DifficultyPreset {
  const found = DIFFICULTY_PRESETS.find((preset) => preset.id === id);
  if (found === undefined) throw new Error(`craterball: unknown difficulty "${id}"`);
  return found;
}
