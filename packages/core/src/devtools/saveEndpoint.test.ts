import { afterEach, describe, expect, test } from "bun:test";

import { getSaveEndpoint, installSaveEndpoint, isProductionEnvironment } from "./saveEndpoint";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  installSaveEndpoint("teardown", "teardown")();
});

describe("installSaveEndpoint", () => {
  test("publishes the endpoint under a dev environment", () => {
    delete process.env.NODE_ENV;
    const uninstall = installSaveEndpoint("/__jgengine/save", "proving-grounds");
    expect(getSaveEndpoint()).toEqual({ url: "/__jgengine/save", gameId: "proving-grounds" });
    uninstall();
    expect(getSaveEndpoint()).toBeNull();
  });

  test("no-ops under a mocked production environment", () => {
    process.env.NODE_ENV = "production";
    expect(isProductionEnvironment()).toBe(true);
    const uninstall = installSaveEndpoint("/__jgengine/save", "proving-grounds");
    expect(getSaveEndpoint()).toBeNull();
    uninstall();
    expect(getSaveEndpoint()).toBeNull();
  });

  test("a caller who forgets its own DEV guard still can't expose the endpoint in prod", () => {
    process.env.NODE_ENV = "production";
    installSaveEndpoint("/__jgengine/save", "unguarded-caller");
    expect(getSaveEndpoint()).toBeNull();
  });
});
