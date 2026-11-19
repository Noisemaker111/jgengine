// `JG_TEST_DATE=2027-03-14T08:00:00Z bun test ...` runs the suite as if the machine's clock said that
// day: `new Date()` and `Date.now()` start from it and keep running at real speed, so timeouts and
// durations still behave. A test whose result changes with the date reads the wall clock where the
// game's own clock belongs (`ctx.wallClock()`); `bun scripts/test-dates.ts` runs the suite on three
// days and names every test whose result moved. Unset, this does nothing.

const shifted = process.env["JG_TEST_DATE"];
if (shifted !== undefined && shifted !== "") {
  const target = Date.parse(shifted);
  if (Number.isNaN(target)) throw new Error(`JG_TEST_DATE is not a date: ${shifted}`);
  const RealDate = Date;
  // The first process fixes the offset and its children inherit it, so a process started later
  // reads a later time, not the target again.
  const inherited = Number(process.env["JG_TEST_DATE_OFFSET"]);
  const offset = Number.isFinite(inherited) && process.env["JG_TEST_DATE_OFFSET"] !== "" ? inherited : target - RealDate.now();
  process.env["JG_TEST_DATE_OFFSET"] = String(offset);
  // A test that pins the clock with bun's `setSystemTime` gets exactly the time it pinned: pinned,
  // `Date.now()` leaves the machine's own clock, which `performance` keeps reading.
  const now = (): number => {
    const real = RealDate.now();
    const machine = performance.timeOrigin + performance.now();
    return Math.abs(real - machine) > 2_000 ? real : real + offset;
  };
  const ShiftedDate = function (this: unknown, ...args: unknown[]) {
    if (!new.target) return new RealDate(now()).toString();
    return args.length === 0 ? new RealDate(now()) : new (RealDate as unknown as new (...rest: unknown[]) => Date)(...args);
  } as unknown as DateConstructor;
  Object.setPrototypeOf(ShiftedDate, RealDate);
  (ShiftedDate as { prototype: Date }).prototype = RealDate.prototype;
  ShiftedDate.now = now;
  globalThis.Date = ShiftedDate;
  shiftFileTimes(offset);
}

/**
 * The same day for files: a file this run writes is stamped by the real clock, so without this a
 * tool that ages its temp files (a lock, a capture profile, a render slot) would see every file it
 * just made as years old. Stats read through `fs` come back shifted, and times written are unshifted.
 */
function shiftFileTimes(offset: number): void {
  const fs = require("node:fs") as typeof import("node:fs");
  const shiftStats = <T>(stats: T): T => {
    if (stats === null || typeof stats !== "object") return stats;
    const s = stats as Record<string, unknown>;
    for (const field of ["atime", "mtime", "ctime", "birthtime"]) {
      const ms = s[`${field}Ms`];
      if (typeof ms !== "number") continue;
      Object.defineProperty(s, `${field}Ms`, { value: ms + offset, configurable: true, writable: true });
      Object.defineProperty(s, field, { value: new Date(ms + offset), configurable: true, writable: true });
    }
    return stats;
  };
  const unshift = (time: unknown): unknown => {
    if (typeof time === "number") return time > 1e11 ? time - offset : time - offset / 1000;
    if (time instanceof Date) return new Date(time.getTime() - offset);
    return time;
  };
  const target = fs as unknown as Record<string, unknown>;
  for (const name of ["statSync", "lstatSync", "fstatSync"]) {
    const real = target[name] as (...args: unknown[]) => unknown;
    target[name] = (...args: unknown[]) => shiftStats(real(...args));
  }
  for (const name of ["stat", "lstat", "fstat"]) {
    const real = target[name] as (...args: unknown[]) => unknown;
    target[name] = (...args: unknown[]) => {
      const done = args.at(-1);
      if (typeof done !== "function") return real(...args);
      return real(...args.slice(0, -1), (error: unknown, stats: unknown) => (done as (e: unknown, s: unknown) => void)(error, shiftStats(stats)));
    };
  }
  const promises = fs.promises as unknown as Record<string, unknown>;
  for (const name of ["stat", "lstat"]) {
    const real = promises[name] as (...args: unknown[]) => Promise<unknown>;
    promises[name] = async (...args: unknown[]) => shiftStats(await real(...args));
  }
  for (const [owner, name] of [[target, "utimesSync"], [target, "lutimesSync"], [target, "utimes"], [target, "lutimes"], [promises, "utimes"], [promises, "lutimes"]] as const) {
    const real = owner[name] as ((...args: unknown[]) => unknown) | undefined;
    if (real === undefined) continue;
    owner[name] = (path: unknown, atime: unknown, mtime: unknown, ...rest: unknown[]) => real(path, unshift(atime), unshift(mtime), ...rest);
  }
}
