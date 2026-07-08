import { describe, expect, test } from "bun:test";

import type { GitHubClient } from "../client";
import { issues, type RawIssue } from "./issues";

const FIXTURE: RawIssue[] = [
  {
    number: 1,
    title: "A real issue",
    state: "open",
    comments: 3,
    created_at: "2026-01-01T00:00:00Z",
    closed_at: null,
    user: { login: "octocat" },
    labels: ["bug", { name: "priority:high" }, {}],
    html_url: "https://github.com/o/r/issues/1",
  },
  {
    number: 2,
    title: "Actually a pull request",
    state: "closed",
    comments: 5,
    pull_request: { url: "https://api.github.com/repos/o/r/pulls/2" },
    created_at: "2026-01-02T00:00:00Z",
    closed_at: "2026-01-03T00:00:00Z",
    user: null,
    html_url: "https://github.com/o/r/issues/2",
  },
];

describe("issues", () => {
  test("maps a plain issue and flags it as not a pull request", async () => {
    const gh = { rest: async () => FIXTURE, graphql: async () => ({}) } as unknown as GitHubClient;
    const result = await issues(gh, "o", "r");

    expect(result[0]).toEqual({
      number: 1,
      title: "A real issue",
      state: "open",
      comments: 3,
      isPullRequest: false,
      createdAt: "2026-01-01T00:00:00Z",
      closedAt: null,
      author: "octocat",
      labels: ["bug", "priority:high"],
      url: "https://github.com/o/r/issues/1",
    });
  });

  test("detects pull requests via the pull_request key and handles a null author", async () => {
    const gh = { rest: async () => FIXTURE, graphql: async () => ({}) } as unknown as GitHubClient;
    const result = await issues(gh, "o", "r");

    expect(result[1]!.isPullRequest).toBe(true);
    expect(result[1]!.author).toBeNull();
    expect(result[1]!.labels).toEqual([]);
  });
});
