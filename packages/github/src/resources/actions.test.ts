import { describe, expect, test } from "bun:test";

import type { GitHubClient } from "../client";
import { workflowRuns, workflows } from "./actions";

describe("workflows", () => {
  test("unwraps the .workflows envelope", async () => {
    const fixture = { workflows: [{ id: 1, name: "CI", state: "active", path: ".github/workflows/ci.yml" }] };
    const gh = { rest: async () => fixture, graphql: async () => ({}) } as unknown as GitHubClient;
    const result = await workflows(gh, "o", "r");
    expect(result).toEqual([{ id: 1, name: "CI", state: "active", path: ".github/workflows/ci.yml" }]);
  });
});

describe("workflowRuns", () => {
  test("unwraps the .workflow_runs envelope and maps snake_case fields", async () => {
    const fixture = {
      workflow_runs: [
        {
          id: 99,
          name: "CI",
          status: "completed",
          conclusion: "success",
          event: "push",
          head_branch: "main",
          run_number: 12,
          created_at: "2026-07-01T00:00:00Z",
          html_url: "https://github.com/o/r/actions/runs/99",
        },
      ],
    };
    const gh = { rest: async () => fixture, graphql: async () => ({}) } as unknown as GitHubClient;
    const result = await workflowRuns(gh, "o", "r");

    expect(result).toEqual([
      {
        id: 99,
        name: "CI",
        status: "completed",
        conclusion: "success",
        event: "push",
        headBranch: "main",
        runNumber: 12,
        createdAt: "2026-07-01T00:00:00Z",
        url: "https://github.com/o/r/actions/runs/99",
      },
    ]);
  });
});
