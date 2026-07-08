import { createReadsHandler } from "@jgengine/ws/readsHandler";

import { createPersistence } from "../../../lib/persistence";

export const GET = createReadsHandler({ persistence: createPersistence });
