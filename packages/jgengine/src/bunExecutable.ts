import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * The bun to spawn from code that may run under Node, such as a Vite config or the CLI on `npx`.
 * Under bun it is this process's own binary. Under Node on Windows a bare `"bun"` fails with ENOENT
 * when bun came from npm, which installs a `bun.cmd` wrapper Node cannot spawn without a shell; the
 * real `bun.exe` sits on PATH (the official installer) or inside the npm package next to the wrapper.
 */
export function bunExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  runningBun: string | null = process.versions["bun"] === undefined ? null : process.execPath,
  exists: (path: string) => boolean = existsSync,
): string {
  if (runningBun !== null) return runningBun;
  if (platform !== "win32") return "bun";
  const path = env["PATH"] ?? env["Path"] ?? "";
  for (const dir of path.split(delimiter)) {
    if (dir === "") continue;
    for (const candidate of [join(dir, "bun.exe"), join(dir, "node_modules", "bun", "bin", "bun.exe")]) {
      if (exists(candidate)) return candidate;
    }
  }
  return "bun";
}
