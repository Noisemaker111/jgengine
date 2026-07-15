import "./index.css";

import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { installSaveEndpoint } from "@jgengine/core/devtools/saveEndpoint";
import { GameHost } from "@jgengine/shell/GameHost";
import { game } from "./game.config";

const GAME_ID = "duet-keys";
if (import.meta.env.DEV) installSaveEndpoint("/__jgengine/save", GAME_ID);

// Editor mode (F2+E / ?mode=editor) loads as a lazy chunk — never bundled into gameplay.
const EditorApp = lazy(async () => {
  const mod = await import("@jgengine/editor");
  return { default: mod.EditorApp as ComponentType<{ gameId: string; playable: typeof game }> };
});

function App() {
  const [editor, setEditor] = useState(
    new URLSearchParams(window.location.search).get("mode") === "editor",
  );
  useEffect(() => {
    if (editor) return;
    const summon = () => setEditor(true);
    (window as { __jgengineSummonEditor?: () => void }).__jgengineSummonEditor = summon;
    let f2Held = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "F2") f2Held = true;
      else if (event.code === "KeyE" && f2Held) {
        event.preventDefault();
        summon();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "F2") f2Held = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      const host = window as { __jgengineSummonEditor?: () => void };
      if (host.__jgengineSummonEditor === summon) delete host.__jgengineSummonEditor;
    };
  }, [editor]);
  if (!editor) return <GameHost playable={game} />;
  return (
    <Suspense fallback={null}>
      <EditorApp gameId={GAME_ID} playable={game} />
    </Suspense>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("main: missing #root mount element");
createRoot(root).render(<App />);
