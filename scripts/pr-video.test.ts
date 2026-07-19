import { describe, expect, test } from "bun:test";
import { parseOriginRepo, sessionCookie } from "./pr-video";

describe("sessionCookie", () => {
  test("wraps a bare user_session value into a cookie header", () => {
    expect(sessionCookie("abc123")).toBe("user_session=abc123; __Host-user_session_same_site=abc123");
  });

  test("passes a full cookie string through untouched", () => {
    const full = "user_session=abc123; logged_in=yes";
    expect(sessionCookie(full)).toBe(full);
    expect(sessionCookie(`  ${full}  `)).toBe(full);
  });
});

describe("parseOriginRepo", () => {
  test("parses https, ssh, and bare owner/repo forms", () => {
    expect(parseOriginRepo("https://github.com/Noisemaker111/jgengine.git")).toEqual({
      owner: "Noisemaker111",
      repo: "jgengine",
    });
    expect(parseOriginRepo("git@github.com:owner/repo.git")).toEqual({ owner: "owner", repo: "repo" });
    expect(parseOriginRepo("owner/repo")).toEqual({ owner: "owner", repo: "repo" });
  });
});
