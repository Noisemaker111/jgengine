import { createReadsHandler } from "@jgengine/ws/readsHandler";

import { createPersistence } from "../../../lib/persistence";

const persistence = createPersistence();

export const GET = createReadsHandler({ persistence: () => persistence });
