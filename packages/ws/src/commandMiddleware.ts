import type { CommandRejection } from "@jgengine/core/commands/commandRegistry";

export type HostCommandOp = "pose" | "runCommand" | "join" | "browse" | "voice";

export type CommandRateLimit = { count: number; perMs: number };

export type CommandLimits = Partial<Record<HostCommandOp, CommandRateLimit>>;

/** Recommended per-op limits a host can opt into via `limits: DEFAULT_COMMAND_LIMITS`. Rate limiting is off unless `limits` is set. */
export const DEFAULT_COMMAND_LIMITS: CommandLimits = {
  pose: { count: 60, perMs: 1_000 },
  runCommand: { count: 30, perMs: 1_000 },
  join: { count: 5, perMs: 10_000 },
  browse: { count: 10, perMs: 5_000 },
  voice: { count: 20, perMs: 1_000 },
};

/** A declared `runCommand` name's input validator, run before the command reaches the game host. */
export type CommandCatalogEntry = {
  validate?: (input: unknown) => CommandRejection | null;
};

export type CommandCatalog = Record<string, CommandCatalogEntry>;

/** Per-command authorization hook: return `false` to reject. Defaults to allow-all when omitted. */
export type CommandAuthorize = (args: {
  userId: string;
  op: HostCommandOp;
  serverId?: string | undefined;
  command?: string | undefined;
}) => boolean | Promise<boolean>;

export type CommandRateLimiter = {
  allow: (connection: object, op: HostCommandOp, atMs: number) => boolean;
};

export function createCommandRateLimiter(limits: CommandLimits): CommandRateLimiter {
  const windows = new WeakMap<object, Map<HostCommandOp, number[]>>();
  return {
    allow(connection, op, atMs) {
      const limit = limits[op];
      if (limit === undefined) return true;
      let perOp = windows.get(connection);
      if (perOp === undefined) {
        perOp = new Map();
        windows.set(connection, perOp);
      }
      const cutoff = atMs - limit.perMs;
      const stamps = (perOp.get(op) ?? []).filter((stamp) => stamp > cutoff);
      if (stamps.length >= limit.count) {
        perOp.set(op, stamps);
        return false;
      }
      stamps.push(atMs);
      perOp.set(op, stamps);
      return true;
    },
  };
}

export function validateCommandInput(
  catalog: CommandCatalog | undefined,
  command: string,
  input: unknown,
): CommandRejection | null {
  if (catalog === undefined) return null;
  const declared = catalog[command];
  if (declared === undefined) return { reason: `Unknown command: ${command}` };
  return declared.validate?.(input) ?? null;
}

export type CommandMiddlewareOptions = {
  limits?: CommandLimits;
  authorize?: CommandAuthorize | undefined;
  validate?: CommandCatalog | undefined;
};

export type CommandGateArgs = {
  connection: object;
  userId: string;
  op: HostCommandOp;
  atMs: number;
  serverId?: string | undefined;
  command?: string;
  input?: unknown;
};

export type CommandGateDecision = { allow: true } | { allow: false; reason: string };

/** A composable rate-limit → validate → authorize pipeline the host router runs before dispatching pose/runCommand/join/browse/voice ops. Every stage defaults to a no-op, so an unconfigured router behaves exactly as before. */
export type CommandMiddleware = {
  check: (args: CommandGateArgs) => Promise<CommandGateDecision>;
};

export function createCommandMiddleware(options: CommandMiddlewareOptions): CommandMiddleware {
  const limiter = createCommandRateLimiter(options.limits ?? {});
  const catalog = options.validate;
  const authorize = options.authorize;

  return {
    async check({ connection, userId, op, atMs, serverId, command, input }) {
      if (!limiter.allow(connection, op, atMs)) {
        return { allow: false, reason: `Rate limited: ${op}` };
      }
      if (op === "runCommand" && command !== undefined) {
        const rejection = validateCommandInput(catalog, command, input);
        if (rejection !== null) return { allow: false, reason: rejection.reason };
      }
      if (authorize !== undefined) {
        const authorized = await authorize({ userId, op, serverId, command });
        if (!authorized) return { allow: false, reason: `Not authorized: ${op}` };
      }
      return { allow: true };
    },
  };
}
