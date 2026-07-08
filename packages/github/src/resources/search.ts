import type { GitHubClient } from "../client";
import { toIssueSummary, type IssueSummary, type RawIssue } from "./issues";
import { toRepoSummary, type RawRepo, type RepoSummary } from "./repos";

export interface SearchResult<T> {
  totalCount: number;
  incomplete: boolean;
  items: T[];
}

interface RawSearchResponse<T> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
}

/** Join qualifier parts (skipping undefined values) into a GitHub search query string. */
export function buildQuery(parts: Record<string, string | number | undefined>): string {
  return Object.entries(parts)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${key}:${value}`)
    .join(" ");
}

/** Search issues and pull requests. Reuses the issues() mapping since search returns the same item shape. */
export async function searchIssues(gh: GitHubClient, query: string): Promise<SearchResult<IssueSummary>> {
  const raw = await gh.rest<RawSearchResponse<RawIssue>>(`/search/issues?q=${encodeURIComponent(query)}`);
  return { totalCount: raw.total_count, incomplete: raw.incomplete_results, items: raw.items.map(toIssueSummary) };
}

/** Search repositories. */
export async function searchRepos(gh: GitHubClient, query: string): Promise<SearchResult<RepoSummary>> {
  const raw = await gh.rest<RawSearchResponse<RawRepo>>(`/search/repositories?q=${encodeURIComponent(query)}`);
  return { totalCount: raw.total_count, incomplete: raw.incomplete_results, items: raw.items.map(toRepoSummary) };
}
