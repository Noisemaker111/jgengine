import { expect, test } from "bun:test";

import { publishedPackageNames, trustedPublishProblem, trustedPublishProblems, type RegistryLookup } from "./check-npm-trusted";

const trusted = (version: string) => ({ "dist-tags": { latest: version }, versions: { [version]: { _npmUser: { name: "GitHub Actions", trustedPublisher: { id: "github" } } } } });
const byToken = (version: string) => ({ "dist-tags": { latest: version }, versions: { [version]: { _npmUser: { name: "someone" } } } });

test("a package npm has never seen is refused, because trusted publishing cannot create one", () => {
  expect(trustedPublishProblem("@jgengine/ui", 404, undefined)).toContain("not on npm");
});

test("a package whose latest version came from a token, not trusted publishing, is refused", () => {
  expect(trustedPublishProblem("@jgengine/core", 200, byToken("0.55.1"))).toContain("not published by trusted publishing");
  expect(trustedPublishProblem("@jgengine/core", 200, trusted("0.55.1"))).toBeNull();
  const bootstrap = (versions: string[]) => ({ "dist-tags": { latest: versions[versions.length - 1] }, versions: Object.fromEntries(versions.map((v) => [v, { _npmUser: { name: "noisemaker11" } }])) });
  expect(trustedPublishProblem("@jgengine/ui", 200, bootstrap(["0.0.0-stage", "0.0.0-bootstrap.0"]))).toBeNull();
  expect(trustedPublishProblem("@jgengine/ui", 200, bootstrap(["0.0.0-bootstrap.0", "0.58.0"]))).toContain("not published by trusted publishing");
});

test("one bad package refuses the whole set, and an unreadable registry fails closed", async () => {
  const lookup: RegistryLookup = async (name) => {
    if (name === "@jgengine/ui") return { status: 404 };
    if (name === "@jgengine/down") throw new Error("ECONNRESET");
    return { status: 200, body: trusted("0.56.0") };
  };
  expect(await trustedPublishProblems(["@jgengine/core", "@jgengine/shell"], lookup)).toEqual([]);
  const problems = await trustedPublishProblems(["@jgengine/core", "@jgengine/ui", "@jgengine/down"], lookup);
  expect(problems).toHaveLength(2);
  expect(problems[1]).toContain("could not be read");
});

test("the checked set is the Publish workflow's list, under each package's npm name", () => {
  const names = publishedPackageNames();
  expect(names[0]).toBe("@jgengine/core");
  expect(names).toContain("@jgengine/ui");
  expect(names).toContain("jgengine");
});
