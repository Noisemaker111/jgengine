import { existsSync } from "node:fs";
import { join } from "node:path";

import { provisionGame } from "../games/shared/provisionAssets";

export async function provisionCapturedGame(gameDir: string, log: (line: string) => void = (line) => console.error(`capture: ${line}`)): Promise<void> {
  if (process.env["JG_DEV_PROVISION"] === "0" || !existsSync(join(gameDir, "src")) || !existsSync(join(gameDir, "package.json"))) return;
  const { failed } = await provisionGame(gameDir, { log });
  if (failed.length > 0) log(`could not pull ${failed.join(", ")} - the run fails if those models are drawn`);
}
