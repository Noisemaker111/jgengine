import { describe, expect, test } from "bun:test";
import {
  convex,
  convexPresence,
  isPresenceOnly,
  isServerAuthoritative,
  offline,
  resolveAuthority,
  ws,
  wsPresence,
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

describe("wsPresence / convexPresence", () => {
  test("always resolve to presence-only, matching the deprecated client-default form", () => {
    expect(resolveAuthority(wsPresence())).toBe("client");
    expect(resolveAuthority(convexPresence())).toBe("client");
    expect(isPresenceOnly(wsPresence({ topology: "shared" }))).toBe(true);
    expect(isPresenceOnly(convexPresence({ topology: "lobbies" }))).toBe(true);
    expect(isServerAuthoritative(wsPresence())).toBe(false);
    expect(isServerAuthoritative(convexPresence())).toBe(false);
  });

  test("carry through topology/url like their un-suffixed counterparts", () => {
    expect(wsPresence({ topology: "lobbies", url: "ws://example/ws" })).toEqual({
      kind: "ws",
      topology: "lobbies",
      url: "ws://example/ws",
      authority: "client",
    });
    expect(convexPresence({ topology: "lobbies" })).toEqual({
      kind: "convex",
      topology: "lobbies",
      authority: "client",
    });
  });
});
