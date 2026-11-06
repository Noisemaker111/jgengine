import { join } from "node:path";

import { suiteTest } from "../../shared/suiteTest";
import { content } from "../proofs/content";

suiteTest(join(import.meta.dir, ".."), content);
