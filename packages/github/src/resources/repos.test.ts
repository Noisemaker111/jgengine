import { describe, expect, test } from "bun:test";

import type { GitHubClient } from "../client";
import { repos, topLanguages, type RawRepo } from "./repos";

const FIXTURE: RawRepo[] = [
  {
    name: "jgengine",
    full_name: "Noisemaker111/jgengine",
    description: "A game engine",
    stargazers_count: 42,
    forks_count: 3,
    watchers_count: 42,
    open_issues_count: 7,
    language: "TypeScript",
    topics: ["game-engine", "typescript"],
    license: { name: "Apache-2.0" },
    archived: false,
    fork: false,
    created_at: "2024-01-01T00:00:00Z",
    pushed_at: "2026-07-01T00:00:00Z",
    html_url: "https://github.com/Noisemaker111/jgengine",
  },
  {
    name: "no-license-repo",
    full_name: "Noisemaker111/no-license-repo",
    description: null,
    stargazers_count: 0,
    forks_count: 0,
    watchers_count: 0,
    open_issues_count: 0,
    language: null,
    license: null,
    archived: true,
    fork: true,
    created_at: "2023-01-01T00:00:00Z",
    pushed_at: null,
    html_url: "https://github.com/Noisemaker111/no-license-repo",
  },
];

describe("repos", () => {
  test("maps raw repo JSON to the lean summary shape", async () => {
    const gh = { rest: async () => FIXTURE, graphql: async () => ({}) } as unknown as GitHubClient;
    const result = await repos(gh, "Noisemaker111");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "jgengine",
      fullName: "Noisemaker111/jgengine",
      description: "A game engine",
      stars: 42,
      forks: 3,
      watchers: 42,
      openIssues: 7,
      language: "TypeScript",
      topics: ["game-engine", "typescript"],
      license: "Apache-2.0",
      archived: false,
      isFork: false,
      createdAt: "2024-01-01T00:00:00Z",
      pushedAt: "2026-07-01T00:00:00Z",
      url: "https://github.com/Noisemaker111/jgengine",
    });
  });

  test("defaults missing topics/license to empty array / null", async () => {
    const gh = { rest: async () => FIXTURE, graphql: async () => ({}) } as unknown as GitHubClient;
    const result = await repos(gh, "Noisemaker111");
    expect(result[1]!.topics).toEqual([]);
    expect(result[1]!.license).toBeNull();
  });
});

describe("topLanguages", () => {
  test("sorts descending by bytes and computes share of total", () => {
    const result = topLanguages({ TypeScript: 300, JavaScript: 100, CSS: 100 });
    expect(result).toEqual([
      { language: "TypeScript", bytes: 300, share: 0.6 },
      { language: "JavaScript", bytes: 100, share: 0.2 },
      { language: "CSS", bytes: 100, share: 0.2 },
    ]);
  });

  test("caps results at n", () => {
    const result = topLanguages({ A: 3, B: 2, C: 1 }, 2);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.language)).toEqual(["A", "B"]);
  });

  test("returns an empty array and avoids division by zero for an empty map", () => {
    expect(topLanguages({})).toEqual([]);
  });
});
