import { ecto } from "../ecto";
import { nextMilestone } from "../milestones";

/** Plain-language next step for the objective card: the next rumor award, the rumor it needs and its prize. */
export function nextStepText(rating: number): string | null {
  const next = nextMilestone(rating);
  if (next === null) return null;
  return `Spread the rumor to ${next.rating} for ${next.label} (${ecto(next.prize)})`;
}

export { nextMilestone };
