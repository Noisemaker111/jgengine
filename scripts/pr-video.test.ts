import { describe, expect, test } from "bun:test";
import { repositoryId, sessionCookie } from "./pr-video";

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

describe("repositoryId", () => {
  test("asks gh api for the repository's id", () => {
    const calls: string[][] = [];
    const id = repositoryId("Noisemaker111/jgengine", (args) => {
      calls.push(args);
      return { status: 0, stdout: "123456\n", stderr: "" };
    });
    expect(id).toBe(123456);
    expect(calls).toEqual([["api", "repos/Noisemaker111/jgengine", "--jq", ".id"]]);
  });
});
