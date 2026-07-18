import type { GameMount } from "./commands";
import type { GameCredit, GameSettingsPatch } from "./gameMeta";

export interface GameListEntry {
  id: string;
  displayName: string;
  capture: { play: string[]; settleMs?: number; stateNames: string[] };
  credit: GameCredit | null;
  hasConfig: boolean;
  hasPackage: boolean;
  thumbnail: string | null;
  hasEditorScene: boolean;
}

export interface ProcessSnapshot {
  key: string;
  label: string;
  running: boolean;
  pid: number | null;
  exitCode: number | null;
  lines: string[];
}

const PREFIX = "/__jgengine/project";

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PREFIX}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as T & { ok?: boolean; error?: string };
  if (!response.ok) {
    const error =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `request failed (${response.status})`;
    throw new Error(error);
  }
  return body;
}

/** URL of a game's thumbnail image, served by the project surface (`null` thumbnail ⇒ 404). */
export function gameThumbnailUrl(id: string): string {
  return `${PREFIX}/games/${encodeURIComponent(id)}/thumbnail`;
}

export async function fetchGames(): Promise<GameListEntry[]> {
  const body = await jsonFetch<{ games: GameListEntry[] }>("/games");
  return body.games;
}

export async function fetchGame(id: string): Promise<GameListEntry> {
  const body = await jsonFetch<{ game: GameListEntry }>(`/games/${encodeURIComponent(id)}`);
  return body.game;
}

export async function saveGameSettings(id: string, patch: GameSettingsPatch): Promise<void> {
  await jsonFetch(`/games/${encodeURIComponent(id)}/settings`, {
    method: "POST",
    body: JSON.stringify(patch),
  });
}

export async function startGameProcess(
  id: string,
  mount: GameMount,
): Promise<{ key: string }> {
  const body = await jsonFetch<{ ok: true; key: string }>(
    `/games/${encodeURIComponent(id)}/start`,
    {
      method: "POST",
      body: JSON.stringify({ mount }),
    },
  );
  return { key: body.key };
}

export async function stopProcess(key: string): Promise<void> {
  await jsonFetch(`/processes/${encodeURIComponent(key)}/stop`, { method: "POST" });
}

export async function createNewGame(id: string, name?: string): Promise<{ key: string }> {
  const body = await jsonFetch<{ ok: true; key: string }>("/new-game", {
    method: "POST",
    body: JSON.stringify({ id, name }),
  });
  return { key: body.key };
}

export async function runGate(): Promise<{ key: string }> {
  const body = await jsonFetch<{ ok: true; key: string }>("/gate", { method: "POST" });
  return { key: body.key };
}

export async function fetchProcessStatus(): Promise<ProcessSnapshot[]> {
  const body = await jsonFetch<{ processes: ProcessSnapshot[] }>("/status");
  return body.processes;
}

export function streamProcess(
  key: string,
  onLine: (line: string) => void,
  onDone: (exitCode: number | null) => void,
): () => void {
  const source = new EventSource(`${PREFIX}/processes/${encodeURIComponent(key)}/stream`);
  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as {
        line?: string;
        done?: boolean;
        exitCode?: number | null;
      };
      if (typeof data.line === "string") onLine(data.line);
      if (data.done === true) {
        onDone(data.exitCode ?? null);
        source.close();
      }
    } catch {
      // ignore malformed frames
    }
  };
  source.onerror = () => {
    source.close();
    onDone(null);
  };
  return () => source.close();
}

export type { GameCredit, GameMount };
