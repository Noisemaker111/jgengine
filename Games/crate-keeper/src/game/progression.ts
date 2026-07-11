export const TWO_STAR_SLACK = 1.4;

export function starTier(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  if (moves <= Math.ceil(par * TWO_STAR_SLACK)) return 2;
  return 1;
}

export function twoStarThreshold(par: number): number {
  return Math.ceil(par * TWO_STAR_SLACK);
}
