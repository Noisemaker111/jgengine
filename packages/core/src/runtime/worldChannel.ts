import type { GameContext } from "./gameContext";
import type { InputFrame } from "./hostedGameRunner";
import type { HostedWorldSession } from "./hostedWorldSession";
import { createWorldMirror } from "./worldMirror";
import type { WorldDiff } from "./worldReplication";
import type { WorldSnapshot } from "./worldSnapshot";

/** Host→client frame: the full baseline a joiner needs, then per-tick diffs. What a transport marshals downstream. */
export type WorldServerFrame =
  | { t: "baseline"; revision: number; snapshot: WorldSnapshot }
  | { t: "diff"; diff: WorldDiff };

/** Client→host frame: a player's session verbs. What a transport marshals upstream. */
export type WorldClientFrame =
  | { t: "join"; isNew: boolean }
  | { t: "leave" }
  | { t: "command"; name: string; input: unknown }
  | { t: "input"; frame: InputFrame };

/** One client's link on the host side: routes its upstream frames into the shared session, pushes it sync frames. */
export interface WorldHostConnection {
  receive(frame: WorldClientFrame): void;
  push(): void;
  close(): void;
}

/**
 * The transport-agnostic host: fans one {@link HostedWorldSession} out to many connections, each tracking its own
 * revision cursor so a joiner gets a baseline and everyone else gets diffs. A ws server, a Convex function, or an
 * in-process loopback all drive the same shape — decode a frame → `connection.receive`; after `session.tick` →
 * `broadcast`. No wire format is assumed; frames are plain data a transport serializes however it likes.
 */
export interface WorldHost {
  connect(userId: string, send: (frame: WorldServerFrame) => void): WorldHostConnection;
  broadcast(): void;
  session(): HostedWorldSession;
}

/** Build a {@link WorldHost} fanning one {@link HostedWorldSession} out to many cursor-tracked connections.
 * @internal
 */
export function createWorldHost(session: HostedWorldSession): WorldHost {
  const connections = new Set<WorldHostConnection>();

  function connect(userId: string, send: (frame: WorldServerFrame) => void): WorldHostConnection {
    let cursor = 0;
    const connection: WorldHostConnection = {
      receive(frame) {
        switch (frame.t) {
          case "join":
            session.join(userId, frame.isNew);
            break;
          case "leave":
            session.leave(userId);
            break;
          case "command":
            session.command(userId, frame.name, frame.input);
            break;
          case "input":
            session.input(userId, frame.frame);
            break;
        }
      },
      push() {
        if (cursor !== 0 && cursor === session.revision()) return;
        const sync = session.sync(cursor === 0 ? null : cursor);
        if (sync.kind === "baseline") {
          cursor = sync.revision;
          send({ t: "baseline", revision: sync.revision, snapshot: sync.snapshot });
        } else {
          cursor = sync.diff.revision;
          send({ t: "diff", diff: sync.diff });
        }
      },
      close() {
        connections.delete(connection);
      },
    };
    connections.add(connection);
    return connection;
  }

  return {
    connect,
    broadcast() {
      for (const connection of connections) connection.push();
    },
    session: () => session,
  };
}

/** The client end of a {@link WorldHost} connection: applies server frames to a local `ctx`, sends session verbs upstream. */
export interface WorldClientLink {
  receive(frame: WorldServerFrame): void;
  join(isNew: boolean): void;
  leave(): void;
  command(name: string, input: unknown): void;
  input(frame: InputFrame): void;
  revision(): number;
}

/** Build a {@link WorldClientLink} — the client end that mirrors host frames into `ctx` and sends session verbs upstream.
 * @internal
 */
export function createWorldClientLink(
  ctx: Pick<GameContext, "hydrate">,
  send: (frame: WorldClientFrame) => void,
): WorldClientLink {
  const mirror = createWorldMirror(ctx);
  return {
    receive(frame) {
      if (frame.t === "baseline") mirror.applyBaseline(frame.revision, frame.snapshot);
      else mirror.applyDiff(frame.diff);
    },
    join: (isNew) => send({ t: "join", isNew }),
    leave: () => send({ t: "leave" }),
    command: (name, input) => send({ t: "command", name, input }),
    input: (frame) => send({ t: "input", frame }),
    revision: () => mirror.revision(),
  };
}
