import { expect, test } from "bun:test";

import { convexApiCatalog } from "../convex/convexApiCatalog";
import { buildAgentPlaybook } from "../convex/playbook";

process.env["CONVEX_SITE_URL"] ??= "http://127.0.0.1:3211";
process.env["SITE_URL"] ??= "http://localhost:3001";
process.env["BETTER_AUTH_SECRET"] ??= "0".repeat(64);

/** Whether `path` (`module:name`, as a bot posts it to /api/query or /api/mutation) is a public function of that kind. */
async function exists(path: string, kind: "query" | "mutation"): Promise<string | null> {
  const [module, name] = path.split(":");
  if (module === undefined || name === undefined) return `${path}: not module:name`;
  let exported: unknown;
  try {
    exported = (await import(`../convex/${module}`))[name];
  } catch {
    return `${path}: no module convex/${module}`;
  }
  if (exported === undefined) return `${path}: convex/${module} exports no ${name}`;
  const fn = exported as { isQuery?: boolean; isMutation?: boolean; isPublic?: boolean };
  const isKind = kind === "query" ? fn.isQuery === true : fn.isMutation === true;
  if (!isKind || fn.isPublic !== true) return `${path}: not a public ${kind}`;
  return null;
}

// Bots learn the API from these two documents and call exactly what they name; a stale name fails a
// bot at runtime, so it fails here first.
test("every function the agent catalog and playbook name is a real public function of that kind", async () => {
  const problems: string[] = [];
  for (const methods of Object.values(convexApiCatalog)) {
    for (const method of methods) {
      const problem = await exists(method.path, method.kind);
      if (problem !== null) problems.push(`catalog ${problem}`);
    }
  }
  for (const step of buildAgentPlaybook().coreLoop) {
    for (const call of step.calls) {
      const match = /^(query|mutation) ([\w/]+:\w+)/.exec(call);
      if (match === null) continue;
      const problem = await exists(match[2]!, match[1] as "query" | "mutation");
      if (problem !== null) problems.push(`playbook ${step.id}: ${problem}`);
    }
  }
  expect(problems).toEqual([]);
});
