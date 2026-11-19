import { nextMilestone } from "../milestones";

export function nextStepText(rating: number): string | null {
  const next = nextMilestone(rating);
  if (next === null) return null;
  return `Reach a ${next.rating} ★ rating for the ${next.label} award ($${next.prize.toLocaleString()})`;
}

export { nextMilestone };
