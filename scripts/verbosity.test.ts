import { expect, test } from "bun:test";

import { isVerbose, takeVerboseFlag, VERBOSE_ENV } from "./verbosity";

test("--verbose leaves the command line and turns on the switch children inherit", () => {
  const env: Record<string, string | undefined> = {};
  expect(takeVerboseFlag(["deepward", "--verbose", "--mode", "play"], env)).toEqual(["deepward", "--mode", "play"]);
  expect(env[VERBOSE_ENV]).toBe("1");
  expect(isVerbose(env)).toBe(true);
});

test("without --verbose the command line is untouched and the run is quiet", () => {
  const env: Record<string, string | undefined> = {};
  expect(takeVerboseFlag(["deepward"], env)).toEqual(["deepward"]);
  expect(isVerbose(env)).toBe(false);
});
