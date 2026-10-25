export const DEFAULT_WORLD_NAME = "My World";
export const DEFAULT_STARTING_MONEY = 1_500;
export const DEFAULT_STARTING_DATA_TOKENS = 0;

export function decideWorldBootstrap<GameId extends string>(input: {
  forceNew: boolean;
  worlds: readonly { _id: GameId }[];
}) {
  if (input.forceNew) {
    if (input.worlds.length === 0) {
      return { action: "create" as const };
    }
    return { action: "delete_all_and_pending" as const, gameIds: input.worlds.map((world) => world._id) };
  }

  const [primaryWorld, ...staleWorlds] = input.worlds;
  if (primaryWorld) {
    return {
      action: "use_existing" as const,
      gameId: primaryWorld._id,
      staleGameIds: staleWorlds.map((world) => world._id),
    };
  }
  return { action: "create" as const };
}
