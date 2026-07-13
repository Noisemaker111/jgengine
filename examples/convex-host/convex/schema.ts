import { defineSchema } from "convex/server";
import { jgengineHostedTables, jgengineTables } from "@jgengine/convex/server";

export default defineSchema({ ...jgengineTables(), ...jgengineHostedTables() });
