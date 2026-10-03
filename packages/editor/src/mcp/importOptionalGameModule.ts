import { access } from "node:fs/promises";

/** @internal Missing optional files are valid; existing modules must load successfully. */
export async function importOptionalGameModule(path: URL): Promise<Record<string, unknown> | undefined> {
  try {
    await access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return import(path.href);
}
