import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { HostedWorldRecord, HostedWorldStore } from "@jgengine/core/runtime/hostedWorldSession";

/** JSON-file implementation of the asynchronous hosted-world persistence seam.
 * @capability hosted-world-persistence Persist hosted authoritative world snapshots in a local file.
 */
export function fileWorldStore(path: string): HostedWorldStore {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, "utf8")) as HostedWorldRecord;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async save(record) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, JSON.stringify(record), "utf8");
      await rename(temporary, path);
    },
  };
}
