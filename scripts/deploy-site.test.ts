import { expect, test } from "bun:test";

import { deploySite, deploySteps, publishThenDeploy, type DeployResult } from "./deploy-site";

test("a release publishes first, then deploys the site", async () => {
  const order: string[] = [];
  const code = await publishThenDeploy(
    async () => {
      order.push("publish");
      return { code: 0, line: "published" };
    },
    () => {
      order.push("deploy");
      return { ok: true, line: "deployed" };
    },
    () => {},
  );
  expect(order).toEqual(["publish", "deploy"]);
  expect(code).toBe(0);
});

test("a failed publish never deploys", async () => {
  let deployed = false;
  const lines: string[] = [];
  const code = await publishThenDeploy(
    async () => ({ code: 1, line: "publish failed" }),
    (): DeployResult => {
      deployed = true;
      return { ok: true, line: "" };
    },
    (line) => lines.push(line),
  );
  expect(deployed).toBe(false);
  expect(code).toBe(1);
  expect(lines.join("\n")).toContain("not deployed");
});

test("a failed deploy fails the release with its reason", async () => {
  const code = await publishThenDeploy(
    async () => ({ code: 0, line: "published" }),
    () => ({ ok: false, line: "deploy:site FAILED" }),
    () => {},
  );
  expect(code).toBe(1);
});

test("the deploy checks out the released commit, provisions models, then deploys, stopping at a failure", () => {
  expect(deploySteps("abc123").map((step) => step.join(" "))).toEqual([
    "git checkout --quiet --detach abc123",
    "bun run games:provision",
    "bun --cwd=apps/web run deploy:cloudflare",
  ]);
  expect(deploySteps()[0]).toEqual(["bun", "run", "games:provision"]);

  const ran: string[] = [];
  const result = deploySite(
    "/repo",
    (command) => {
      ran.push(command.join(" "));
      return command.includes("deploy:cloudflare") ? { status: 1, tail: "wrangler: not authenticated" } : { status: 0, tail: "" };
    },
    "abc123",
  );
  expect(ran).toHaveLength(3);
  expect(result.ok).toBe(false);
  expect(result.line).toContain("deploy:cloudflare");
  expect(result.line).toContain("wrangler: not authenticated");

  const early: string[] = [];
  deploySite("/repo", (command) => {
    early.push(command[0]!);
    return { status: 2, tail: "" };
  });
  expect(early).toEqual(["bun"]);
});
