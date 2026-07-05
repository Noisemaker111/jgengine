import type { PresenceTransport } from "../multiplayer/presenceContract";

export type JoinServerResult = {
  serverId: string;
  isNew: boolean;
};

export type RunCommandArgs = {
  serverId: string;
  command: string;
  input: unknown;
};

export type TransportRunCommandResult =
  | { ok: true }
  | { ok: false; reason: string };

export type GameRuntimeServerView = {
  serverId: string;
  gameId: string;
  revision: number;
  memberUserIds: string[];
  serverState: unknown;
  updatedAt: number;
};

export type GameRuntimePlayerView = {
  userId: string;
  gameId: string;
  playerState: unknown;
  updatedAt: number;
};

export type GameRuntimeFeedView = {
  action: string;
  entries: unknown[];
};

export type GameRuntimeTransport = {
  joinServer: (args: { gameId: string; serverId?: string }) => Promise<JoinServerResult>;
  leaveServer: (args: { serverId: string }) => Promise<void>;
  runCommand: (args: RunCommandArgs) => Promise<TransportRunCommandResult>;
};

export type FeedUnsubscribe = () => void;

export type GameRuntimeFeeds = {
  subscribeServer: (
    serverId: string,
    onChange: (view: GameRuntimeServerView | null) => void,
  ) => FeedUnsubscribe;
  subscribePlayer: (
    args: { serverId: string },
    onChange: (view: GameRuntimePlayerView | null) => void,
  ) => FeedUnsubscribe;
  subscribeFeed: (
    args: { serverId: string; action: string },
    onChange: (view: GameRuntimeFeedView) => void,
  ) => FeedUnsubscribe;
};

export type GameBackend<
  TPresenceRow = unknown,
  TPresenceLocation = unknown,
  TGameId extends string = string,
> = {
  transport: GameRuntimeTransport;
  feeds?: GameRuntimeFeeds;
  presence?: PresenceTransport<TPresenceRow, TPresenceLocation, TGameId>;
};
