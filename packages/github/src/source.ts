import { labelFromISO, levelForCount, type DayCell } from "./calendar";
import type { ContributionsWire, GitHubProfile } from "./wire";

export type { ContributionsWire, GitHubProfile } from "./wire";

export interface ContributionData {
  cells: DayCell[];
  profile: GitHubProfile | null;
  source: "graphql" | "scrape";
}

export const DEFAULT_ENDPOINT = "/api/github-contributions";

/** Flatten the proxy's week/day wire into positioned, leveled, labeled cells. */
export function wireToCells(wire: ContributionsWire): DayCell[] {
  const cells: DayCell[] = [];
  wire.weeks.forEach((week, week_index) => {
    for (const day of week.days) {
      cells.push({
        index: cells.length,
        week: week_index,
        weekday: day.weekday,
        count: day.count,
        level: levelForCount(day.count),
        label: labelFromISO(day.date),
      });
    }
  });
  return cells;
}

/** Browser client: fetch a user's contributions through the proxy endpoint. */
export async function contributions(user: string, endpoint: string = DEFAULT_ENDPOINT): Promise<ContributionData> {
  const response = await fetch(`${endpoint}?user=${encodeURIComponent(user)}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Lookup failed (${response.status})`);
  }
  const wire = (await response.json()) as ContributionsWire;
  return { cells: wireToCells(wire), profile: wire.profile, source: wire.source };
}
