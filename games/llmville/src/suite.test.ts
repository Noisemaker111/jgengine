import { join } from "node:path";

import { suiteTest } from "../../shared/suiteTest";

// The genre suite's score, run in the game's own tests: no proofs yet is an honest 0, a lost proof fails.
suiteTest(join(import.meta.dir, ".."));
