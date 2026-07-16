import { describe, expect, test } from "bun:test";
import {
  convex,
  isPresenceOnly,
  isServerAuthoritative,
  offline,
  resolveAuthority,
  ws,
} from "@jgengine/core/runtime/adapter";

describe("isServerAuthoritative", () => {
  test("is true only when an adapter opts into authority: server", () => {
    expect(isServerAuthoritative(ws({ authority: "server" }))).toBe(true);
    expect(isServerAuthoritative(convex({ authority: "server" }))).toBe(true);
    expect(isServerAuthoritative(ws())).toBe(false);
    expect(isServerAuthoritative(ws({ authority: "client" }))).toBe(false);
    expect(isServerAuthoritative(offline())).toBe(false);
    expect(isServerAuthoritative("off")).toBe(false);
    expect(isServerAuthoritative({ adapter: ws({ authority: "server" }) })).toBe(true);
  });
});

describe("resolveAuthority / isPresenceOnly", () => {
  test("offline and missing adapters resolve to null", () => {
    expect(resolveAuthority(offline())).toBe(null);
    expect(resolveAuthority(undefined)).toBe(null);
    expect(isPresenceOnly(offline())).toBe(false);
  });

  test("unset authority on a live adapter is presence-only client", () => {
    expect(resolveAuthority(ws())).toBe("client");
    expect(resolveAuthority(ws({ authority: "client" }))).toBe("client");
    expect(isPresenceOnly(ws())).toBe(true);
    expect(isPresenceOnly(ws({ authority: "server" }))).toBe(false);
  });

  test("server authority is not presence-only", () => {
    expect(resolveAuthority(ws({ authority: "server" }))).toBe("server");
    expect(isPresenceOnly(convex({ authority: "server" }))).toBe(false);
  });
});
