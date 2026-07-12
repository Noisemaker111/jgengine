import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["packages", "Games", "apps", "examples"];
const CONCURRENCY = 8;

function workspaceDirs(): string[] {
  const dirs: string[] = [];
  for (const root of ROOTS) {
    const abs = join(process.cwd(), root);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(join(root, entry.name));
    }
  }
  if (existsSync(join(process.cwd(), "registry", "package.json"))) dirs.push("registry");
  return dirs.filter((dir) => {
    const pkgPath = join(process.cwd(), dir, "package.json");
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
    };
    return typeof pkg.scripts?.["check-types"] === "string";
  });
}

async function checkOne(dir: string): Promise<{ dir: string; ok: boolean; output: string }> {
  const proc = Bun.spawn(["bun", "run", "--cwd", dir, "check-types"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { dir, ok: exitCode === 0, output: `${stdout}${stderr}`.trim() };
}

const dirs = workspaceDirs();
const failures: { dir: string; output: string }[] = [];
let checked = 0;

const queue = [...dirs];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let dir = queue.shift(); dir !== undefined; dir = queue.shift()) {
      const result = await checkOne(dir);
      checked += 1;
      if (!result.ok) failures.push({ dir: result.dir, output: result.output });
    }
  }),
);

console.log(`check-types-all: ${checked} workspaces checked, ${failures.length} failing`);
for (const failure of failures) {
  console.error(`\n--- ${failure.dir} ---\n${failure.output}`);
}
if (failures.length > 0) process.exit(1);
