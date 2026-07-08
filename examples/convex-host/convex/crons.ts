import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("jg tick", { seconds: 1 }, internal.runtime.tickActiveServers, {});
crons.interval("jg flush", { seconds: 60 }, internal.runtime.flushDirtyServers, {});

export default crons;
