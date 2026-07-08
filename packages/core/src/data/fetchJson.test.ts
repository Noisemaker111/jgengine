import { describe, expect, test } from "bun:test";

import { fetchJson, HttpStatusError, JsonParseError, type FetchImpl } from "./fetchJson";

describe("fetchJson", () => {
  test("resolves parsed JSON on a 2xx response", async () => {
    const fetchImpl: FetchImpl = (async () =>
      new Response(JSON.stringify({ temperature: 72 }), {
        status: 200,
        statusText: "OK",
      })) as FetchImpl;

    const result = await fetchJson<{ temperature: number }>("https://example.com/weather", { fetchImpl });
    expect(result).toEqual({ temperature: 72 });
  });

  test("throws a typed HttpStatusError on a non-2xx response", async () => {
    const fetchImpl: FetchImpl = (async () =>
      new Response("nope", { status: 500, statusText: "Internal Server Error" })) as FetchImpl;

    await expect(fetchJson("https://example.com/broken", { fetchImpl })).rejects.toThrow(HttpStatusError);
    try {
      await fetchJson("https://example.com/broken", { fetchImpl });
      throw new Error("expected fetchJson to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpStatusError);
      const httpError = error as HttpStatusError;
      expect(httpError.status).toBe(500);
      expect(httpError.statusText).toBe("Internal Server Error");
      expect(httpError.url).toBe("https://example.com/broken");
    }
  });

  test("surfaces malformed JSON as a typed JsonParseError", async () => {
    const fetchImpl: FetchImpl = (async () => new Response("{not valid json", { status: 200 })) as FetchImpl;

    await expect(fetchJson("https://example.com/bad-json", { fetchImpl })).rejects.toThrow(JsonParseError);
  });

  test("treats an empty body as undefined instead of a parse error", async () => {
    const fetchImpl: FetchImpl = (async () => new Response("", { status: 204 })) as FetchImpl;

    const result = await fetchJson<undefined>("https://example.com/no-content", { fetchImpl });
    expect(result).toBeUndefined();
  });

  test("forwards method, headers, body, and signal to the injected fetch", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const controller = new AbortController();
    const fetchImpl: FetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as FetchImpl;

    await fetchJson("https://example.com/create", {
      fetchImpl,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "loot-shooter" }),
      signal: controller.signal,
    });

    expect(calls.length).toBe(1);
    const [url, init] = calls[0]!;
    expect(url).toBe("https://example.com/create");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json" });
    expect(init?.body).toBe(JSON.stringify({ name: "loot-shooter" }));
    expect(init?.signal).toBe(controller.signal);
  });

  test("defaults to globalThis.fetch when no fetchImpl is supplied", async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response(JSON.stringify({ stubbed: true }), { status: 200 });
    }) as typeof fetch;

    try {
      const result = await fetchJson<{ stubbed: boolean }>("https://example.com/default-fetch");
      expect(called).toBe(true);
      expect(result).toEqual({ stubbed: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
