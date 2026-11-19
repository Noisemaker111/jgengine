import { describe, expect, test } from "bun:test";

import { githubProxyHandler, parseContributionsHtml } from "./server";

function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return (async () =>
    ({
      ok,
      status,
      headers: new Headers(),
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as unknown as typeof fetch;
}

const HTML = `
  <table>
    <td tabindex="-1" data-ix="0" class="ContributionCalendar-day" data-date="2026-07-06" data-level="1" role="gridcell" id="c1"></td>
    <td tabindex="-1" data-ix="1" class="ContributionCalendar-day" data-date="2026-07-07" data-level="4" role="gridcell" id="c2"></td>
    <td tabindex="-1" data-ix="2" class="ContributionCalendar-day" data-date="2026-07-08" data-level="0" role="gridcell" id="c3"></td>
  </table>
  <tool-tip id="t1" for="c1" popover="manual" class="sr-only position-absolute">2 contributions on July 6th.</tool-tip>
  <tool-tip id="t2" for="c2" popover="manual" class="sr-only position-absolute">17 contributions on July 7th.</tool-tip>
  <tool-tip id="t3" for="c3" popover="manual" class="sr-only position-absolute">No contributions on July 8th.</tool-tip>
`;

describe("parseContributionsHtml", () => {
  test("pairs each day cell with its tooltip count regardless of attribute order", () => {
    const days = parseContributionsHtml(HTML);
    expect(days).toEqual([
      { date: "2026-07-06", count: 2, weekday: 1 },
      { date: "2026-07-07", count: 17, weekday: 2 },
      { date: "2026-07-08", count: 0, weekday: 3 },
    ]);
  });

  test("returns nothing for markup without day cells", () => {
    expect(parseContributionsHtml("<div>no calendar here</div>")).toEqual([]);
  });
});

describe("githubProxyHandler", () => {
  test("forwards an allowlisted REST path", async () => {
    const handle = githubProxyHandler({
      allowPath: (path) => path === "/repos/Noisemaker111/jgengine",
      fetchImpl: fakeFetch({ full_name: "Noisemaker111/jgengine" }),
    });
    const res = await handle(new Request("https://site.example/api/github-proxy?path=/repos/Noisemaker111/jgengine"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ full_name: "Noisemaker111/jgengine" });
  });

  test("rejects a REST path that isn't on the allowlist", async () => {
    const handle = githubProxyHandler({
      allowPath: (path) => path === "/repos/Noisemaker111/jgengine",
      fetchImpl: fakeFetch({}),
    });
    const res = await handle(new Request("https://site.example/api/github-proxy?path=/user/emails"));
    expect(res.status).toBe(403);
  });

  test("denies every REST path when allowPath is omitted", async () => {
    const handle = githubProxyHandler({ fetchImpl: fakeFetch({}) });
    const res = await handle(new Request("https://site.example/api/github-proxy?path=/repos/Noisemaker111/jgengine"));
    expect(res.status).toBe(403);
  });

  test("forwards an allowlisted GraphQL operation, sending only the server-trusted query", async () => {
    let sentBody: string | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sentBody = init?.body as string;
      return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify({ data: {} }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const handle = githubProxyHandler({ graphqlOperations: { contributions: "query { viewer { login } }" }, fetchImpl });
    const res = await handle(
      new Request("https://site.example/api/github-proxy?op=contributions", {
        method: "POST",
        body: JSON.stringify({ variables: { login: "octocat" } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(sentBody!)).toEqual({ query: "query { viewer { login } }", variables: { login: "octocat" } });
  });

  test("rejects a GraphQL operation name that isn't on the allowlist", async () => {
    const handle = githubProxyHandler({ graphqlOperations: { contributions: "query {}" }, fetchImpl: fakeFetch({}) });
    const res = await handle(
      new Request("https://site.example/api/github-proxy?op=deleteEverything", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(403);
  });

  test("denies every GraphQL operation when graphqlOperations is omitted", async () => {
    const handle = githubProxyHandler({ fetchImpl: fakeFetch({}) });
    const res = await handle(new Request("https://site.example/api/github-proxy?op=contributions", { method: "POST", body: "{}" }));
    expect(res.status).toBe(403);
  });

  test("rejects a write method against an allowlisted REST path", async () => {
    const handle = githubProxyHandler({
      allowPath: (path) => path === "/repos/Noisemaker111/jgengine",
      fetchImpl: fakeFetch({}),
    });
    const res = await handle(new Request("https://site.example/api/github-proxy?path=/repos/Noisemaker111/jgengine", { method: "POST" }));
    expect(res.status).toBe(405);
  });

  test("rejects '?path=/graphql' — GraphQL must go through '?op='", async () => {
    const handle = githubProxyHandler({ fetchImpl: fakeFetch({}) });
    const res = await handle(new Request("https://site.example/api/github-proxy?path=/graphql", { method: "POST" }));
    expect(res.status).toBe(403);
  });
});
