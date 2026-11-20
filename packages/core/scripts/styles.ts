// Writes the engine stylesheet (src/ui/engineStyles.view.ts) to src/ui/styles.css and, after a build, dist/ui/styles.css.
import { existsSync } from "node:fs";

import { ENGINE_STYLESHEET } from "../src/ui/engineStyles.view";

await Bun.write(new URL("../src/ui/styles.css", import.meta.url), ENGINE_STYLESHEET);
if (existsSync(new URL("../dist", import.meta.url))) await Bun.write(new URL("../dist/ui/styles.css", import.meta.url), ENGINE_STYLESHEET);
