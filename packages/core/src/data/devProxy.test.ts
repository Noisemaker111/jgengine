import { describe, expect, test } from "bun:test";

import { DEFAULT_DEV_PROXY_PREFIX, parseDevProxyTable, proxiedUrl } from "./devProxy";

describe("parseDevProxyTable", () => {
  test("parses a JSON object of route name to base URL", () => {
    const table = parseDevProxyTable('{"weather":"https://api.weather.example.com"}');
    expect(table).toEqual({ weather: "https://api.weather.example.com" });
  });

  test("returns an empty table for undefined, empty, or malformed input", () => {
    expect(parseDevProxyTable(undefined)).toEqual({});
    expect(parseDevProxyTable("")).toEqual({});
    expect(parseDevProxyTable("not json")).toEqual({});
    expect(parseDevProxyTable("[1,2,3]")).toEqual({});
  });

  test("drops non-string entries", () => {
    const table = parseDevProxyTable('{"weather":"https://a.example.com","broken":42}');
    expect(table).toEqual({ weather: "https://a.example.com" });
  });
});

describe("proxiedUrl", () => {
  const table = { weather: "https://api.weather.example.com" };

  test("passes the raw URL through outside dev", () => {
    expect(proxiedUrl("https://api.weather.example.com/v1/today", { dev: false, table })).toBe(
      "https://api.weather.example.com/v1/today",
    );
  });

  test("rewrites a matching target to the dev-proxy path", () => {
    expect(proxiedUrl("https://api.weather.example.com/v1/today", { dev: true, table })).toBe(
      `${DEFAULT_DEV_PROXY_PREFIX}/weather/v1/today`,
    );
  });

  test("passes through in dev when no table entry matches the target", () => {
    expect(proxiedUrl("https://unmapped.example.com/x", { dev: true, table })).toBe("https://unmapped.example.com/x");
  });

  test("supports a custom prefix", () => {
    expect(proxiedUrl("https://api.weather.example.com/today", { dev: true, table, prefix: "/api-proxy" })).toBe(
      "/api-proxy/weather/today",
    );
  });
});
