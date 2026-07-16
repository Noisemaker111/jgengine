import { describe, expect, test } from "bun:test";

import { createGitHub, GitHubError } from "./client";

function fakeFetch(record: string[], body: unknown, ok = true, status = 200): typeof fetch {
  return (async (url: string) => {
    record.push(String(url));
    return {
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }) as unknown as typeof fetch;
}

describe("createGitHub", () => {
  test("direct mode hits api.github.com", async () => {
    const calls: string[] = [];
    const gh = createGitHub({ fetchImpl: fakeFetch(calls, [{ x: 1 }]) });
    await gh.rest("/users/octocat/repos");
    expect(calls[0]).toBe("https://api.github.com/users/octocat/repos");
  });

  test("proxy mode routes through the endpoint with the path encoded", async () => {
    const calls: string[] = [];
    const gh = createGitHub({ endpoint: "/api/github", fetchImpl: fakeFetch(calls, []) });
    await gh.rest("/repos/a/b/pulls?state=open");
    expect(calls[0]).toBe(`/api/github?path=${encodeURIComponent("/repos/a/b/pulls?state=open")}`);
  });

  test("non-ok responses throw a GitHubError carrying the status", async () => {
    const gh = createGitHub({ fetchImpl: fakeFetch([], { message: "x" }, false, 404) });
    await expect(gh.rest("/nope")).rejects.toBeInstanceOf(GitHubError);
  });

  test("graphql without a token or proxy endpoint refuses rather than leaking", async () => {
    const gh = createGitHub({ fetchImpl: fakeFetch([], {}) });
    await expect(gh.graphql("query {}")).rejects.toBeInstanceOf(GitHubError);
  });

  test("graphql in proxy mode sends the operation name via '?op=', never raw query text", async () => {
    const calls: string[] = [];
    let sentBody = "";
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      sentBody = String(init?.body ?? "");
      return { ok: true, status: 200, json: async () => ({ data: { viewer: { login: "octocat" } } }) } as Response;
    }) as unknown as typeof fetch;
    const gh = createGitHub({ endpoint: "/api/github-proxy", fetchImpl });
    await gh.graphql("contributions", { login: "octocat" });
    expect(calls[0]).toBe("/api/github-proxy?op=contributions");
    expect(JSON.parse(sentBody)).toEqual({ variables: { login: "octocat" } });
  });
});
