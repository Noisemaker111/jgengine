import { expect, test } from "bun:test";

import {
  createCommandMiddleware,
  createCommandRateLimiter,
  DEFAULT_COMMAND_LIMITS,
  validateCommandInput,
} from "./commandMiddleware";

test("createCommandRateLimiter: allows up to count within the window then blocks", () => {
  const limiter = createCommandRateLimiter({ runCommand: { count: 2, perMs: 1_000 } });
  const connection = {};
  expect(limiter.allow(connection, "runCommand", 0)).toBe(true);
  expect(limiter.allow(connection, "runCommand", 10)).toBe(true);
  expect(limiter.allow(connection, "runCommand", 20)).toBe(false);
});

test("createCommandRateLimiter: window slides forward over time", () => {
  const limiter = createCommandRateLimiter({ runCommand: { count: 1, perMs: 1_000 } });
  const connection = {};
  expect(limiter.allow(connection, "runCommand", 0)).toBe(true);
  expect(limiter.allow(connection, "runCommand", 500)).toBe(false);
  expect(limiter.allow(connection, "runCommand", 1_001)).toBe(true);
});

test("createCommandRateLimiter: an op absent from limits is always allowed", () => {
  const limiter = createCommandRateLimiter({});
  const connection = {};
  for (let i = 0; i < 50; i += 1) {
    expect(limiter.allow(connection, "pose", i)).toBe(true);
  }
});

test("createCommandRateLimiter: separate connections and ops get independent budgets", () => {
  const limiter = createCommandRateLimiter({ runCommand: { count: 1, perMs: 1_000 } });
  const alice = {};
  const bob = {};
  expect(limiter.allow(alice, "runCommand", 0)).toBe(true);
  expect(limiter.allow(bob, "runCommand", 0)).toBe(true);
  expect(limiter.allow(alice, "runCommand", 1)).toBe(false);
});

test("validateCommandInput: an undefined catalog passes every command through", () => {
  expect(validateCommandInput(undefined, "anything.goes", { any: "input" })).toBeNull();
});

test("validateCommandInput: rejects command names absent from a declared catalog", () => {
  const rejection = validateCommandInput({ "engine.ping": {} }, "engine.nope", null);
  expect(rejection?.reason).toMatch(/Unknown command: engine\.nope/);
});

test("validateCommandInput: runs a declared command's input validator", () => {
  const catalog = {
    "move.to": {
      validate: (input: unknown) =>
        typeof input === "object" && input !== null ? null : { reason: "input must be an object" },
    },
  };
  expect(validateCommandInput(catalog, "move.to", { x: 1 })).toBeNull();
  expect(validateCommandInput(catalog, "move.to", "nope")?.reason).toBe("input must be an object");
});

test("createCommandMiddleware: unconfigured pipeline allows everything", async () => {
  const middleware = createCommandMiddleware({});
  const decision = await middleware.check({
    connection: {},
    userId: "alice",
    op: "runCommand",
    atMs: 0,
    command: "anything",
    input: { whatever: true },
  });
  expect(decision).toEqual({ allow: true });
});

test("createCommandMiddleware: rate limit stage rejects before validate or authorize run", async () => {
  let authorizeCalls = 0;
  const middleware = createCommandMiddleware({
    limits: { runCommand: { count: 1, perMs: 1_000 } },
    validate: { "engine.ping": {} },
    authorize: () => {
      authorizeCalls += 1;
      return true;
    },
  });
  const connection = {};
  const first = await middleware.check({
    connection,
    userId: "alice",
    op: "runCommand",
    atMs: 0,
    command: "engine.ping",
  });
  expect(first).toEqual({ allow: true });
  const second = await middleware.check({
    connection,
    userId: "alice",
    op: "runCommand",
    atMs: 1,
    command: "engine.ping",
  });
  expect(second.allow).toBe(false);
  if (!second.allow) expect(second.reason).toMatch(/Rate limited: runCommand/);
  expect(authorizeCalls).toBe(1);
});

test("createCommandMiddleware: validate stage rejects unknown commands before authorize runs", async () => {
  let authorizeCalls = 0;
  const middleware = createCommandMiddleware({
    validate: { "engine.ping": {} },
    authorize: () => {
      authorizeCalls += 1;
      return true;
    },
  });
  const decision = await middleware.check({
    connection: {},
    userId: "alice",
    op: "runCommand",
    atMs: 0,
    command: "engine.nope",
  });
  expect(decision.allow).toBe(false);
  if (!decision.allow) expect(decision.reason).toMatch(/Unknown command: engine\.nope/);
  expect(authorizeCalls).toBe(0);
});

test("createCommandMiddleware: authorize hook can deny an op, and defaults to allow when omitted", async () => {
  const middleware = createCommandMiddleware({
    authorize: (args) => args.op !== "browse",
  });
  const allowed = await middleware.check({ connection: {}, userId: "alice", op: "join", atMs: 0 });
  expect(allowed).toEqual({ allow: true });
  const denied = await middleware.check({ connection: {}, userId: "alice", op: "browse", atMs: 0 });
  expect(denied.allow).toBe(false);
  if (!denied.allow) expect(denied.reason).toMatch(/Not authorized: browse/);
});

test("DEFAULT_COMMAND_LIMITS: declares a limit for every host command op", () => {
  const ops: (keyof typeof DEFAULT_COMMAND_LIMITS)[] = ["pose", "runCommand", "join", "browse", "voice"];
  for (const op of ops) {
    const limit = DEFAULT_COMMAND_LIMITS[op];
    expect(limit).toBeDefined();
    expect(limit?.count).toBeGreaterThan(0);
    expect(limit?.perMs).toBeGreaterThan(0);
  }
});
