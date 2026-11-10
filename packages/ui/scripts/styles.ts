// Writes the engine stylesheet (src/engineStyles.ts) to src/styles.css and, after a build, dist/styles.css.
import { existsSync } from "node:fs";

import { ENGINE_STYLESHEET } from "../src/engineStyles";

await Bun.write(new URL("../src/styles.css", import.meta.url), ENGINE_STYLESHEET);
if (existsSync(new URL("../dist", import.meta.url))) await Bun.write(new URL("../dist/styles.css", import.meta.url), ENGINE_STYLESHEET);
