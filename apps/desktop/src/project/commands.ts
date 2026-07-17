export type GameMount = "runner" | "standalone" | "website";

export type ProjectAction =
  | { kind: "new-game"; id: string; name?: string }
  | { kind: "start-game"; id: string; mount: GameMount }
  | { kind: "stop-game"; id: string }
  | { kind: "run-gate" }
  | { kind: "open-runner"; id: string; mode: "play" | "editor" | "ui" };

export interface ShellCommand {
  label: string;
  argv: string[];
  cwd?: "repo" | "game";
  stream: boolean;
}

export function buildShellCommand(action: ProjectAction): ShellCommand {
  switch (action.kind) {
    case "new-game": {
      const name = action.name !== undefined && action.name.trim().length > 0 ? action.name.trim() : action.id;
      const argv = ["bun", "packages/jgengine/src/cli/index.ts", "create", name];
      return { label: `create ${name}`, argv, cwd: "repo", stream: true };
    }
    case "start-game": {
      if (action.mount === "standalone") {
        return {
          label: `games:${action.id}`,
          argv: ["bun", "run", `games:${action.id}`],
          cwd: "repo",
          stream: true,
        };
      }
      if (action.mount === "website") {
        return {
          label: "dev (website + /play)",
          argv: ["bun", "run", "dev"],
          cwd: "repo",
          stream: true,
        };
      }
      return {
        label: `dev:runner game=${action.id}`,
        argv: ["bun", "run", "dev:runner"],
        cwd: "repo",
        stream: true,
      };
    }
    case "stop-game":
      return {
        label: `stop ${action.id}`,
        argv: [],
        stream: false,
      };
    case "run-gate":
      return {
        label: "gate",
        argv: ["bun", "run", "gate"],
        cwd: "repo",
        stream: true,
      };
    case "open-runner":
      return {
        label: `open ${action.id} (${action.mode})`,
        argv: [],
        stream: false,
      };
  }
}

export function runnerOpenPath(id: string, mode: "play" | "editor" | "ui"): string {
  const params = new URLSearchParams({ game: id, mode });
  return `?${params.toString()}`;
}

export function websitePlayPath(id: string): string {
  return `/play/?game=${encodeURIComponent(id)}`;
}

export function processKey(kind: "game" | "gate" | "new-game", id?: string): string {
  if (kind === "game") return `game:${id ?? "*"}`;
  if (kind === "new-game") return `new-game:${id ?? "*"}`;
  return "gate";
}
