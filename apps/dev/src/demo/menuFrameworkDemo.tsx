import { useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { PauseMenu } from "@jgengine/react/modals";
import { MenuScreen } from "@jgengine/react/menuScreen";
import { TitleMenu } from "@jgengine/react/titleMenu";
import { useSettings } from "@jgengine/react/settings";
import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 80, d: 80 }, height: 3.2, frequency: 0.028, seed: "menu-framework" }),
  vegetation: grass({ area: { w: 72, d: 72 }, density: 3, colors: ["#243b1c", "#7fae45"], seed: "menu-framework" }),
});

const game = defineGameDefinition({
  name: "menu-framework",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

type Screen = "title" | "play" | "paused";

const screenStore = (() => {
  let screen: Screen = "title";
  const listeners = new Set<() => void>();
  return {
    get: () => screen,
    set(next: Screen) {
      if (next === screen) return;
      screen = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();

const hintStyle: CSSProperties = {
  position: "absolute",
  top: 18,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "6px 14px",
  borderRadius: 999,
  background: "rgba(12,16,22,0.72)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#dbe4ef",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 0.3,
};

function MenuFrameworkUI(): ReactNode {
  const screen = useSyncExternalStore(screenStore.subscribe, screenStore.get, screenStore.get);
  const settings = useSettings();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== "Escape" || settings.isOpen) return;
      if (screenStore.get() === "play") screenStore.set("paused");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.isOpen]);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <TitleMenu
        open={screen === "title"}
        title="Menu Framework"
        eyebrow="Engine demo"
        tagline="A live 3D scene behind an animated, keyboard and gamepad navigable front-end."
        items={[
          { id: "new", label: "New Game", primary: true, hint: "Drop into the demo scene" },
          { id: "settings", label: "Settings", hint: "Engine settings surface" },
          { id: "credits", label: "Credits", hint: "Ships with the save screen", disabled: true },
        ]}
        onSelect={(id) => {
          if (id === "new") screenStore.set("play");
          else if (id === "settings") settings.open();
        }}
        footer="menu-framework demo"
        style={{ pointerEvents: screen === "title" ? "auto" : "none" }}
      />

      {screen === "play" ? <div style={hintStyle} data-demo-hint="">Play · Press Esc to pause</div> : null}

      <MenuScreen
        open={screen === "paused"}
        transition="scale"
        label="Paused"
        style={{ pointerEvents: screen === "paused" ? "auto" : "none" }}
      >
        <PauseMenu
          title="Paused"
          onResume={() => screenStore.set("play")}
          items={[
            { id: "settings", label: "Settings", onSelect: () => settings.open() },
            { id: "title", label: "Quit to title", danger: true, onSelect: () => screenStore.set("title") },
          ]}
        />
      </MenuScreen>
    </div>
  );
}

function onInit(ctx: GameContext): void {
  ctx.game.commands.define("menu.play", { apply: (state) => { screenStore.set("play"); return state; } });
  ctx.game.commands.define("menu.pause", { apply: (state) => { screenStore.set("paused"); return state; } });
  ctx.game.commands.define("menu.title", { apply: (state) => { screenStore.set("title"); return state; } });
}

export const menuFrameworkDemoGame: PlayableGame = {
  game,
  content: { entityById: () => null, objectById: () => null },
  loop: { onInit, onNewPlayer: () => {}, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: MenuFrameworkUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 30, initialHeight: 22, minDistance: 14, maxDistance: 60, targetHeight: 0, maxPolarAngle: 1.32 },
  capture: {
    states: {
      title: [{ name: "menu.title" }],
      play: [{ name: "menu.play" }],
      pause: [{ name: "menu.play" }, { name: "menu.pause" }],
    },
    views: {
      title: { description: "Title screen over the live 3D scene", settleMs: 400 },
      pause: { description: "Pause screen over live play", state: "pause", settleMs: 400 },
    },
  },
};

