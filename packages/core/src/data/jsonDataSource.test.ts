import { describe, expect, test } from "bun:test";

import { createJsonDataSource } from "./jsonDataSource";
import type { FetchImpl } from "./fetchJson";

describe("createJsonDataSource", () => {
  test("composes fetchJson with createDataSource end to end", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ items: [1, 2, 3] }), { status: 200 });
    }) as FetchImpl;

    const source = createJsonDataSource<{ items: number[] }>("https://example.com/items", { fetchImpl });
    await source.refresh();

    expect(calls).toEqual(["https://example.com/items"]);
    expect(source.getState()).toEqual({ status: "ready", data: { items: [1, 2, 3] }, error: undefined });
  });

  test("surfaces non-2xx responses as an error state", async () => {
    const fetchImpl: FetchImpl = (async () => new Response("nope", { status: 404, statusText: "Not Found" })) as FetchImpl;

    const source = createJsonDataSource("https://example.com/missing", { fetchImpl });
    await source.refresh();

    const state = source.getState();
    expect(state.status).toBe("error");
    expect(state.error?.message).toContain("404");
  });
});
