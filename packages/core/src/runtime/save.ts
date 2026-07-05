export type SaveScope = "player" | "chunks" | "player+chunks";

export type SaveConfig =
  | "none"
  | {
      auto: string;
      scope: SaveScope;
    };

export function parseSaveAutoMs(auto: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(auto.trim());
  if (!match) {
    throw new Error(`Invalid save.auto interval: ${auto}`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case "ms":
      return amount;
    case "s":
      return amount * 1_000;
    case "m":
      return amount * 60_000;
    case "h":
      return amount * 3_600_000;
    default:
      throw new Error(`Invalid save.auto unit: ${unit}`);
  }
}

export function saveScopeIncludesPlayer(scope: SaveScope): boolean {
  return scope === "player" || scope === "player+chunks";
}

export function saveScopeIncludesChunks(scope: SaveScope): boolean {
  return scope === "chunks" || scope === "player+chunks";
}

export function isSaveEnabled(config: SaveConfig): config is Exclude<SaveConfig, "none"> {
  return config !== "none";
}
