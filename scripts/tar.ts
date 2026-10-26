// Git Bash puts GNU tar first on PATH, and GNU tar reads `C:\...` as a remote host named `C`
// ("Cannot connect to C: resolve failed"), so an extract that names a Windows path fails from Git
// Bash and works from PowerShell. Windows ships bsdtar at System32\tar.exe, which takes drive
// paths; elsewhere `tar` is the system one.
import { existsSync } from "node:fs";
import { join } from "node:path";

/** The tar executable to spawn on this platform. */
export function tarExecutable(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string {
  if (platform !== "win32") return "tar";
  const system = join(env.SystemRoot ?? env.windir ?? "C:\\Windows", "System32", "tar.exe");
  return existsSync(system) ? system : "tar";
}

/** Arguments to extract a gzipped tarball into `destination`; GNU tar gets `--force-local` so a drive letter is a path. */
export function extractArgs(archive: string, destination: string, extra: readonly string[] = [], executable = tarExecutable()): string[] {
  const local = executable === "tar" && process.platform === "win32" ? ["--force-local"] : [];
  return [...local, "-xzf", archive, "-C", destination, ...extra];
}
