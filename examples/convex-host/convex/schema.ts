import { defineSchema } from "convex/server";
import { jgengineTables } from "@jgengine/convex/server";

export default defineSchema({ ...jgengineTables() });
