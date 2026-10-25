import { nextMilestone } from "../milestones";

/** Plain-language next step for the objective card: the next award, its rating and its prize. */
export function nextStepText(rating: number): string | null {
  const next = nextMilestone(rating);
  if (next === null) return null;
  return `Reach a ${next.rating} ★ rating for the ${next.label} award ($${next.prize.toLocaleString()})`;
}

export { nextMilestone };
