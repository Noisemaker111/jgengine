import { join } from "node:path";

import { suiteTest } from "../../shared/suiteTest";

suiteTest(join(import.meta.dir, ".."), null);
