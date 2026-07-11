export const SAUCER_TABLE: readonly (50 | 100 | 150 | 300)[] = [
  100, 50, 50, 100, 150, 100, 100, 50, 300, 100, 100, 100, 50, 150, 100,
];

export function saucerScore(shotsFired: number): 50 | 100 | 150 | 300 {
  const index = ((shotsFired % SAUCER_TABLE.length) + SAUCER_TABLE.length) % SAUCER_TABLE.length;
  return SAUCER_TABLE[index]!;
}
