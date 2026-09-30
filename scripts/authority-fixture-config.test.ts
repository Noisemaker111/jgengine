import { expect, test } from "bun:test";
import { fixturePorts } from "./authority-fixture-config";

test("fixture listeners retain managed defaults and accept isolated ports", () => {
  expect(fixturePorts({})).toEqual({ frontend: 4624, realm: 4625 });
  expect(fixturePorts({ JG_FIXTURE_FRONTEND_PORT: "4634", JG_FIXTURE_REALM_PORT: "4635" })).toEqual({ frontend: 4634, realm: 4635 });
});

test("fixture listeners reject invalid and overlapping ports before startup", () => {
  for (const value of ["", "0", "65536", "-1", "1.5", "4634abc", "Infinity"]) {
    expect(() => fixturePorts({ JG_FIXTURE_FRONTEND_PORT: value })).toThrow("integer port");
    expect(() => fixturePorts({ JG_FIXTURE_REALM_PORT: value })).toThrow("integer port");
  }
  expect(() => fixturePorts({ JG_FIXTURE_FRONTEND_PORT: "4625" })).toThrow("must differ");
});
