import { existsSync } from "node:fs";

/**
 * Dev-only Vite plugin: the server exits once no connection (tab, HMR socket, request)
 * has been open for `JG_DEV_IDLE_MINUTES` (default 20; 0 keeps it up), or at once when
 * its folder is deleted. Agents and captures start `bun run dev` and never stop it, and
 * dozens of stale servers piled up holding memory.
 */
export const DEFAULT_IDLE_EXIT_MINUTES = 20;

export function resolveIdleExitMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.JG_DEV_IDLE_MINUTES;
  if (raw === undefined || raw.trim() === "") return DEFAULT_IDLE_EXIT_MINUTES * 60_000;
  const minutes = Number(raw);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 0;
}

export type IdleVerdict = "keep" | "idle" | "orphaned";

export function idleVerdict(state: {
  now: number;
  lastActivity: number;
  openSockets: number;
  rootExists: boolean;
  idleMs: number;
}): IdleVerdict {
  if (!state.rootExists) return "orphaned";
  if (state.idleMs <= 0 || state.openSockets > 0) return "keep";
  return state.now - state.lastActivity >= state.idleMs ? "idle" : "keep";
}

type SocketLike = { once(event: "close", listener: () => void): void };
type ServerLike = {
  config: { root: string };
  httpServer?: {
    on?(event: "connection", listener: (socket: SocketLike) => void): void;
    once(event: string, listener: () => void): void;
  } | null;
};

export function viteIdleExit(options: { idleMs?: number; checkEveryMs?: number } = {}): {
  name: string;
  apply: "serve";
  configureServer(server: ServerLike): void;
} {
  return {
    name: "jg-dev-idle-exit",
    apply: "serve",
    configureServer(server) {
      const idleMs = options.idleMs ?? resolveIdleExitMs();
      const httpServer = server.httpServer;
      if (httpServer?.on === undefined) return;
      let lastActivity = Date.now();
      let openSockets = 0;
      httpServer.on("connection", (socket) => {
        openSockets += 1;
        lastActivity = Date.now();
        socket.once("close", () => {
          openSockets -= 1;
          lastActivity = Date.now();
        });
      });
      const timer = setInterval(() => {
        const verdict = idleVerdict({
          now: Date.now(),
          lastActivity,
          openSockets,
          rootExists: existsSync(server.config.root),
          idleMs,
        });
        if (verdict === "keep") return;
        console.error(
          verdict === "orphaned"
            ? `dev: ${server.config.root} is gone, stopping this server`
            : `dev: no connection for ${Math.round(idleMs / 60_000)} min, stopping (JG_DEV_IDLE_MINUTES=0 keeps it up)`,
        );
        process.exit(0);
      }, options.checkEveryMs ?? 60_000);
      timer.unref?.();
      httpServer.once("close", () => clearInterval(timer));
    },
  };
}
