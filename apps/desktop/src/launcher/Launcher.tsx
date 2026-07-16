import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createNewGame,
  fetchGames,
  fetchProcessStatus,
  runGate,
  saveGameSettings,
  startGameProcess,
  stopProcess,
  streamProcess,
  type GameListEntry,
  type GameMount,
  type ProcessSnapshot,
} from "../project/client";
import { runnerOpenPath } from "../project/commands";
import { GatePanel } from "./GatePanel";
import { NewGameDialog } from "./NewGameDialog";
import { RunPanel } from "./RunPanel";
import { SettingsPanel } from "./SettingsPanel";

function initialFromQuery(id: string | null): string | null {
  if (id === null || id.length === 0) return null;
  return id;
}

export function Launcher() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [games, setGames] = useState<GameListEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialFromQuery(params.get("select")),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [processes, setProcesses] = useState<ProcessSnapshot[]>([]);
  const [gateKey, setGateKey] = useState<string | null>(null);
  const [gateLines, setGateLines] = useState<string[]>([]);
  const [gateRunning, setGateRunning] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = games.find((game) => game.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    try {
      const [nextGames, nextStatus] = await Promise.all([fetchGames(), fetchProcessStatus()]);
      setGames(nextGames);
      setProcesses(nextStatus);
      setLoadError(null);
      setSelectedId((current) => current ?? nextGames[0]?.id ?? null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void fetchProcessStatus()
        .then(setProcesses)
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (gateKey === null) return;
    setGateLines([]);
    setGateRunning(true);
    return streamProcess(
      gateKey,
      (line) => setGateLines((prev) => [...prev, line]),
      () => {
        setGateRunning(false);
        void fetchProcessStatus().then(setProcesses);
      },
    );
  }, [gateKey]);

  const openInApp = (id: string, mode: "play" | "editor" | "ui") => {
    window.location.search = runnerOpenPath(id, mode).slice(1);
  };

  const onStart = async (mount: GameMount) => {
    if (selected === null) return;
    setBusy(`start:${mount}`);
    setNotice(null);
    try {
      await startGameProcess(selected.id, mount);
      setNotice(`Started ${selected.id} (${mount})`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const onStop = async (key: string) => {
    setBusy(`stop:${key}`);
    try {
      await stopProcess(key);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const onSaveSettings = async (input: {
    displayName: string;
    capturePlay: string[];
    creditText: string;
    creditUrl: string;
    creditHandle: string;
  }) => {
    if (selected === null) return;
    setBusy("settings");
    setNotice(null);
    try {
      await saveGameSettings(selected.id, {
        displayName: input.displayName,
        capturePlay: input.capturePlay,
        credit:
          input.creditText.trim().length === 0
            ? null
            : {
                text: input.creditText.trim(),
                ...(input.creditUrl.trim().length > 0 ? { url: input.creditUrl.trim() } : {}),
                ...(input.creditHandle.trim().length > 0
                  ? { handle: input.creditHandle.trim() }
                  : {}),
              },
      });
      setNotice("Saved settings to game.config.ts");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const onRunGate = async () => {
    setBusy("gate");
    setNotice(null);
    try {
      const { key } = await runGate();
      setGateKey(key);
      setNotice("Gate started");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const onCreateGame = async (id: string, name: string) => {
    setBusy("new-game");
    setNotice(null);
    try {
      const { key } = await createNewGame(id, name);
      setShowNew(false);
      setNotice(`Scaffolding ${id}…`);
      streamProcess(
        key,
        () => undefined,
        async () => {
          await refresh();
          setSelectedId(id);
          setNotice(`Created Games/${id}`);
        },
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const selectedProcessKeys = processes
    .filter((proc) => selected !== null && proc.key.startsWith(`game:${selected.id}:`))
    .map((proc) => proc.key);

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
        <div>
          <div className="text-sm font-semibold tracking-wide text-white">JGengine Project</div>
          <div className="text-xs text-neutral-400">
            Launcher over new:game · games:&lt;id&gt; · gate · in-app runner/editor
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
          <button
            type="button"
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
            onClick={() => setShowNew(true)}
          >
            New Game
          </button>
        </div>
      </header>

      {loadError !== null && (
        <div className="border-b border-red-900/60 bg-red-950/40 px-5 py-2 text-xs text-red-300">
          Project surface API unavailable ({loadError}). Start via{" "}
          <code className="text-red-200">bun run --cwd apps/desktop dev</code>.
        </div>
      )}
      {notice !== null && (
        <div className="border-b border-neutral-800 bg-neutral-900/70 px-5 py-2 text-xs text-neutral-300">
          {notice}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-r border-neutral-800 p-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
            Games/{games.length}
          </div>
          <ul className="space-y-1.5">
            {games.map((game) => {
              const active = game.id === selectedId;
              return (
                <li key={game.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(game.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition ${
                      active
                        ? "border-sky-700/80 bg-sky-950/40"
                        : "border-transparent bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900"
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-800 text-sm font-semibold text-neutral-300">
                      {game.thumbnail !== null ? (
                        <span className="text-[10px] text-neutral-500">img</span>
                      ) : (
                        game.displayName.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-neutral-100">
                        {game.displayName}
                      </div>
                      <div className="truncate text-[11px] text-neutral-500">{game.id}</div>
                    </div>
                  </button>
                </li>
              );
            })}
            {games.length === 0 && loadError === null && (
              <li className="px-2 py-6 text-center text-xs text-neutral-500">No games found</li>
            )}
          </ul>
        </aside>

        <main className="min-h-0 overflow-y-auto p-4">
          {selected === null ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              Select a game or create one
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-semibold text-white">{selected.displayName}</h1>
                    <p className="text-xs text-neutral-400">
                      Games/{selected.id}
                      {selected.hasEditorScene ? " · editor.scene.json" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                      onClick={() => openInApp(selected.id, "play")}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-800"
                      onClick={() => openInApp(selected.id, "editor")}
                    >
                      Editor
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-800"
                      onClick={() => openInApp(selected.id, "ui")}
                    >
                      UI preview
                    </button>
                  </div>
                </div>
              </section>

              <RunPanel
                gameId={selected.id}
                busy={busy}
                processKeys={selectedProcessKeys}
                processes={processes}
                onStart={(mount) => void onStart(mount)}
                onStop={(key) => void onStop(key)}
              />

              <SettingsPanel
                key={selected.id}
                game={selected}
                busy={busy === "settings"}
                onSave={(input) => void onSaveSettings(input)}
              />

              <GatePanel
                busy={busy === "gate"}
                running={gateRunning}
                lines={gateLines}
                processes={processes.filter((proc) => proc.key === "gate" || proc.key === gateKey)}
                onRun={() => void onRunGate()}
                onStop={() => {
                  if (gateKey !== null) void onStop(gateKey);
                }}
              />
            </div>
          )}
        </main>
      </div>

      {showNew && (
        <NewGameDialog
          busy={busy === "new-game"}
          onCancel={() => setShowNew(false)}
          onCreate={(id, name) => void onCreateGame(id, name)}
        />
      )}
    </div>
  );
}
