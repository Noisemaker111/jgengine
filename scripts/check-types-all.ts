import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["packages", "apps", "examples"];
/**
 * Dirs that are not workspaces but carry their own tsconfig and `check-types`: the repository's
 * `scripts/` are run as often as any package and had no typecheck until they were listed here.
 */
const EXTRA_DIRS = ["scripts"];
const CONCURRENCY = 8;

/** Every dir this runs a `check-types` in: the workspaces plus {@link EXTRA_DIRS}. */
export function typecheckedDirs(root: string = process.cwd()): string[] {
  const dirs: string[] = [];
  for (const workspaceRoot of ROOTS) {
    const abs = join(root, workspaceRoot);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(`${workspaceRoot}/${entry.name}`);
    }
  }
  dirs.push(...EXTRA_DIRS);
  if (existsSync(join(root, "registry", "package.json"))) dirs.push("registry");
  return dirs.filter((dir) => {
    const pkgPath = join(root, dir, "package.json");
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

async function main(): Promise<number> {
  const dirs = typecheckedDirs();
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

  console.log(`check-types-all: ${checked} dirs checked, ${failures.length} failing`);
  for (const failure of failures) {
    console.error(`\n--- ${failure.dir} ---\n${failure.output}`);
  }
  return failures.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(await main());
