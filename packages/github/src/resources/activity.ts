import { GitHubError, type GitHubClient } from "../client";

export interface ActivityEvent {
  type: string;
  repo: string;
  createdAt: string;
  action?: string;
}

interface RawEvent {
  type: string | null;
  repo: { name: string };
  created_at: string | null;
  payload?: { action?: string };
}

function clampPerPage(perPage: number | undefined): number {
  return Math.min(perPage ?? 30, 100);
}

export interface EventsOptions {
  perPage?: number;
}

/** A user's public activity feed (pushes, issue/PR actions, stars, forks, …). */
export async function events(gh: GitHubClient, user: string, opts: EventsOptions = {}): Promise<ActivityEvent[]> {
  const params = new URLSearchParams({ per_page: String(clampPerPage(opts.perPage)) });
  const raw = await gh.rest<RawEvent[]>(`/users/${encodeURIComponent(user)}/events?${params.toString()}`);
  return raw.map((e) => {
    const summary: ActivityEvent = { type: e.type ?? "unknown", repo: e.repo.name, createdAt: e.created_at ?? "" };
    const action = e.payload?.action;
    if (action !== undefined) summary.action = action;
    return summary;
  });
}

export interface CommitActivityWeek {
  weekStart: number;
  total: number;
  days: number[];
}

interface RawCommitActivityWeek {
  week: number;
  total: number;
  days: number[];
}

/**
 * Weekly commit counts for the last year. GitHub computes these stats
 * asynchronously and may respond 202 with an empty body while the cache
 * warms up; when the parsed payload isn't an array, this returns `[]`
 * rather than throwing.
 */
export async function commitActivity(gh: GitHubClient, owner: string, name: string): Promise<CommitActivityWeek[]> {
  let raw: unknown;
  try {
    raw = await gh.rest<unknown>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/stats/commit_activity`);
  } catch (err) {
    if (err instanceof GitHubError) throw err;
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return (raw as RawCommitActivityWeek[]).map((w) => ({ weekStart: w.week, total: w.total, days: w.days }));
}
