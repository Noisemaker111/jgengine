import { describe, expect, test } from "bun:test";
import { convex, isServerAuthoritative, offline, ws } from "@jgengine/core/runtime/adapter";

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
