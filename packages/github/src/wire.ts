/** The normalized JSON the proxy handler returns and the client consumes. */
export interface GitHubProfile {
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface ContributionsWire {
  source: "graphql" | "scrape";
  profile: GitHubProfile | null;
  total: number;
  weeks: { days: { date: string; count: number; weekday: number }[] }[];
}
