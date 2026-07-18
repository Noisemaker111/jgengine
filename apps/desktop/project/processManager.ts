import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";

import {
  applyGameSettingsPatch,
  type GameSettingsPatch,
  validateNewGameId,
} from "../src/project/gameMeta";
import { buildShellCommand, processKey, type GameMount } from "../src/project/commands";
import { listGames, readGameSettings, type GameListEntry } from "./listGames";

export interface ProcessSnapshot {
  key: string;
  label: string;
  running: boolean;
  pid: number | null;
  exitCode: number | null;
  lines: string[];
}

export interface ThumbnailFile {
  data: Buffer;
  contentType: string;
}

export interface ProjectSurfaceHost {
  list(): GameListEntry[];
  get(id: string): GameListEntry | null;
  readThumbnail(id: string): ThumbnailFile | null;
  saveSettings(id: string, patch: GameSettingsPatch): { ok: true } | { ok: false; error: string };
  startGame(
    id: string,
    mount: GameMount,
  ): { ok: true; key: string } | { ok: false; error: string };
  stop(key: string): { ok: true } | { ok: false; error: string };
  newGame(
    id: string,
    name?: string,
  ): { ok: true; key: string } | { ok: false; error: string };
  runGate(): { ok: true; key: string } | { ok: false; error: string };
  status(): ProcessSnapshot[];
  getProcess(key: string): ProcessSnapshot | null;
  subscribe(key: string, listener: (line: string) => void): () => void;
}

interface TrackedProcess {
  key: string;
  label: string;
  child: ChildProcess;
  lines: string[];
  exitCode: number | null;
  listeners: Set<(line: string) => void>;
}

const MAX_LINES = 4000;

function appendLine(tracked: TrackedProcess, line: string): void {
  tracked.lines.push(line);
  if (tracked.lines.length > MAX_LINES) {
    tracked.lines.splice(0, tracked.lines.length - MAX_LINES);
  }
  for (const listener of tracked.listeners) listener(line);
}

function snapshotOf(tracked: TrackedProcess): ProcessSnapshot {
  return {
    key: tracked.key,
    label: tracked.label,
    running: tracked.exitCode === null && tracked.child.exitCode === null && !tracked.child.killed,
    pid: tracked.child.pid ?? null,
    exitCode: tracked.exitCode ?? tracked.child.exitCode,
    lines: tracked.lines.slice(),
  };
}

export function createProjectSurfaceHost(options: {
  repoRoot: string;
  gamesDir: string;
}): ProjectSurfaceHost {
  const { repoRoot, gamesDir } = options;
  const processes = new Map<string, TrackedProcess>();

  function spawnTracked(key: string, label: string, argv: string[]): TrackedProcess {
    const existing = processes.get(key);
    if (existing !== undefined && existing.exitCode === null && !existing.child.killed) {
      throw new Error(`${key} is already running`);
    }
    const [cmd, ...args] = argv;
    if (cmd === undefined) throw new Error("empty command");
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      env: process.env,
      shell: process.platform === "win32",
      windowsHide: true,
    });
    const tracked: TrackedProcess = {
      key,
      label,
      child,
      lines: [],
      exitCode: null,
      listeners: new Set(),
    };
    const onChunk = (chunk: Buffer | string, stream: "stdout" | "stderr") => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.length === 0) continue;
        appendLine(tracked, stream === "stderr" ? `[err] ${line}` : line);
      }
    };
    child.stdout?.on("data", (chunk: Buffer | string) => onChunk(chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer | string) => onChunk(chunk, "stderr"));
    child.on("error", (error) => {
      appendLine(tracked, `[err] ${error.message}`);
      tracked.exitCode = 1;
    });
    child.on("close", (code) => {
      tracked.exitCode = code ?? 0;
      appendLine(tracked, `[exit] ${tracked.exitCode}`);
    });
    processes.set(key, tracked);
    return tracked;
  }

  return {
    list() {
      return listGames({ gamesDir });
    },
    get(id) {
      return readGameSettings(gamesDir, id);
    },
    readThumbnail(id) {
      if (!GAME_ID_OK(id)) return null;
      const game = readGameSettings(gamesDir, id);
      if (game === null || game.thumbnail === null) return null;
      const gameRoot = join(gamesDir, id);
      const absolutePath = join(gameRoot, game.thumbnail);
      // Guard against traversal: the resolved file must stay inside the game dir.
      if (absolutePath !== gameRoot && !absolutePath.startsWith(gameRoot + sep)) return null;
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return null;
      return { data: readFileSync(absolutePath), contentType: thumbnailContentType(absolutePath) };
    },
    saveSettings(id, patch) {
      if (!GAME_ID_OK(id)) return { ok: false, error: `invalid game id: ${id}` };
      const configPath = join(gamesDir, id, "src", "game.config.ts");
      if (!existsSync(configPath)) return { ok: false, error: `missing ${id}/src/game.config.ts` };
      try {
        const source = readFileSync(configPath, "utf8");
        const next = applyGameSettingsPatch(source, patch);
        writeFileSync(configPath, next.endsWith("\n") ? next : `${next}\n`);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    startGame(id, mount) {
      if (!GAME_ID_OK(id)) return { ok: false, error: `invalid game id: ${id}` };
      if (readGameSettings(gamesDir, id) === null) return { ok: false, error: `unknown game: ${id}` };
      const command = buildShellCommand({ kind: "start-game", id, mount });
      const key = processKey("game", `${id}:${mount}`);
      try {
        spawnTracked(key, command.label, command.argv);
        return { ok: true, key };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    stop(key) {
      const tracked = processes.get(key);
      if (tracked === undefined) return { ok: false, error: `unknown process: ${key}` };
      if (tracked.exitCode !== null) return { ok: true };
      tracked.child.kill();
      if (process.platform === "win32" && tracked.child.pid !== undefined) {
        spawn("taskkill", ["/pid", String(tracked.child.pid), "/T", "/F"], {
          shell: true,
          windowsHide: true,
        });
      }
      return { ok: true };
    },
    newGame(id, name) {
      const idError = validateNewGameId(id);
      if (idError !== null) return { ok: false, error: idError };
      if (existsSync(join(gamesDir, id))) return { ok: false, error: `Games/${id} already exists` };
      const command = buildShellCommand({ kind: "new-game", id, name });
      const key = processKey("new-game", id);
      try {
        spawnTracked(key, command.label, command.argv);
        return { ok: true, key };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    runGate() {
      const command = buildShellCommand({ kind: "run-gate" });
      const key = processKey("gate");
      try {
        spawnTracked(key, command.label, command.argv);
        return { ok: true, key };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    status() {
      return [...processes.values()].map(snapshotOf);
    },
    getProcess(key) {
      const tracked = processes.get(key);
      return tracked === undefined ? null : snapshotOf(tracked);
    },
    subscribe(key, listener) {
      const tracked = processes.get(key);
      if (tracked === undefined) return () => {};
      tracked.listeners.add(listener);
      return () => {
        tracked.listeners.delete(listener);
      };
    },
  };
}

function GAME_ID_OK(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(id);
}

function thumbnailContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
