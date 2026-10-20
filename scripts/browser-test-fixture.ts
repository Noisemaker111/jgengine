import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packagesRoot = resolve(import.meta.dir, "../packages");
const packed = new Map<string, Promise<string>>();
let cacheDir: string | undefined;

async function run(command: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" });
  const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (exit !== 0) throw new Error(`${command.join(" ")} exited ${exit}: ${stderr.trim() || stdout.trim()}`);
  return stdout;
}

function packCache(): string {
  if (cacheDir === undefined) {
    const dir = mkdtempSync(join(tmpdir(), "jgengine-public-pack-"));
    cacheDir = dir;
    process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  }
  return cacheDir;
}

/** Pack `packages/<pkg>` once per test process; later callers share the same tarball. */
export function packPublicPackage(pkg: string): Promise<string> {
  let tarball = packed.get(pkg);
  if (tarball === undefined) {
    const destination = join(packCache(), pkg);
    mkdirSync(destination, { recursive: true });
    // `bun pm pack` ships the same file set as `npm pack` without loading the npm workspace tree,
    // which took 15-20 s per call on a loaded runner and blew browser-fixture setup budgets.
    tarball = run([process.execPath, "pm", "pack", "--ignore-scripts", "--quiet", "--destination", destination], join(packagesRoot, pkg))
      .then(stdout => {
        const file = stdout.trim().split("\n").at(-1)?.trim();
        if (!file?.endsWith(".tgz")) throw new Error(`bun pm pack printed no tarball for ${pkg}: ${stdout}`);
        return file;
      });
    tarball.catch(() => packed.delete(pkg));
    packed.set(pkg, tarball);
  }
  return tarball;
}

/** Install the published file set of each `@jgengine/<pkg>` into `<root>/node_modules/@jgengine/<pkg>`. */
export async function installPublicPackages(root: string, packages: readonly string[]): Promise<void> {
  await Promise.all(packages.map(async pkg => {
    const tarball = await packPublicPackage(pkg);
    const destination = join(root, "node_modules", "@jgengine", pkg);
    mkdirSync(destination, { recursive: true });
    await run(["tar", "-xzf", tarball, "-C", destination, "--strip-components=1"], root);
  }));
}

interface FixturePage {
  goto(url: string): Promise<unknown>;
  once(event: "pageerror", listener: (error: Error) => void): unknown;
  off(event: "pageerror", listener: (error: Error) => void): unknown;
}

/**
 * Navigate to a fixture page and wait for its ready condition. Fails at once with the page's own
 * error instead of a short wall-clock deadline, which turned slow loads on a busy runner into failures.
 */
export async function gotoFixture(page: FixturePage, url: string, ready: () => Promise<unknown>): Promise<void> {
  let onError: (error: Error) => void = () => {};
  const crashed = new Promise<never>((_, reject) => { onError = reject; });
  crashed.catch(() => {});
  page.once("pageerror", onError);
  try {
    await page.goto(url);
    await Promise.race([ready(), crashed]);
  } finally {
    page.off("pageerror", onError);
  }
}
