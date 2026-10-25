import { describe, expect, test } from "bun:test";

import { resolveGithubToken, wantsGithubToken, withGithubAuth } from "./githubToken";

describe("asset pulls use a GitHub token when one exists", () => {
  test("env wins, then the gh CLI's token, else none", () => {
    let asked = 0;
    const gh = () => {
      asked += 1;
      return "gho_cli";
    };
    expect(resolveGithubToken({ GITHUB_TOKEN: "ghp_env" }, gh)).toBe("ghp_env");
    expect(resolveGithubToken({ GH_TOKEN: "ghp_gh" }, gh)).toBe("ghp_gh");
    expect(asked).toBe(0);
    expect(resolveGithubToken({}, gh)).toBe("gho_cli");
    expect(resolveGithubToken({ GITHUB_TOKEN: " " }, () => null)).toBeUndefined();
  });

  test("only rate-limited GitHub hosts get the header", () => {
    expect(wantsGithubToken("https://api.github.com/repos/microsoft/Microsoft-Rocketbox/contents")).toBe(true);
    expect(wantsGithubToken("https://raw.githubusercontent.com/a/b/c.glb")).toBe(true);
    expect(wantsGithubToken("https://codeload.github.com/game-icons/icons/zip/HEAD")).toBe(true);
    expect(wantsGithubToken("https://github.com/Noisemaker111/jgengine/releases/download/packs/x.zip")).toBe(false);
    expect(wantsGithubToken("https://api.polyhaven.com/files/x")).toBe(false);
    expect(wantsGithubToken("http://api.github.com/x")).toBe(false);
  });

  test("the header is added without dropping the caller's, and never replaces one it set", () => {
    const added = withGithubAuth("https://api.github.com/x", { accept: "application/vnd.github+json" }, "t1");
    expect(added.get("authorization")).toBe("Bearer t1");
    expect(added.get("accept")).toBe("application/vnd.github+json");
    expect(withGithubAuth("https://api.github.com/x", { authorization: "Bearer mine" }, "t1").get("authorization")).toBe("Bearer mine");
    expect(withGithubAuth("https://example.com/x", undefined, "t1").has("authorization")).toBe(false);
    expect(withGithubAuth("https://api.github.com/x", undefined, undefined).has("authorization")).toBe(false);
  });
});
