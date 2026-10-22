import { useEffect, useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { MenuScreen } from "@jgengine/react/menuScreen";
import { useMenuNav } from "@jgengine/react/menuNav";
import { PauseMenu } from "@jgengine/react/modals";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import { TitleMenu } from "@jgengine/react/titleMenu";
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

type Screen = "title" | "play" | "paused" | "settings";

const settingsTabStore = (() => {
  let tab = "";
  const listeners = new Set<() => void>();
  return {
    get: () => tab,
    set(next: string) {
      if (next === tab) return;
      tab = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();

const screenStore = (() => {
  let screen: Screen = "title";
  let returnTo: Screen = "title";
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  return {
    get: () => screen,
    set(next: Screen) {
      if (next === screen) return;
      screen = next;
      notify();
    },
    openSettings(from: Screen) {
      returnTo = from;
      if (screen !== "settings") {
        screen = "settings";
        notify();
      }
    },
    closeSettings() {
      if (screen !== "settings") return;
      screen = returnTo;
      notify();
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

const settingsHeading: CSSProperties = {
  margin: 0,
  fontFamily: "var(--jg-font-display, inherit)",
  fontSize: "var(--jg-type-xl, 20px)",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--jg-text, #f5f7fa)",
};

/** A settings screen the demo lays out itself from the shipped settings blocks. */
function DemoSettings({ open }: { open: boolean }): ReactNode {
  const settings = useSettings();
  const ids = useMemo(() => settings.categories.map((category) => category.id), [settings.categories]);
  const pref = useSyncExternalStore(settingsTabStore.subscribe, settingsTabStore.get, settingsTabStore.get);
  const active = pref !== "" && ids.includes(pref) ? pref : (ids[0] ?? "");
  const nav = useMenuNav({
    ids,
    columns: Math.max(1, ids.length),
    enabled: open && ids.length > 0,
    onConfirm: (id) => settingsTabStore.set(id),
    onBack: () => screenStore.closeSettings(),
  });
  const category = settings.categories.find((candidate) => candidate.id === active) ?? settings.categories[0] ?? null;

  return (
    <MenuScreen
      open={open}
      transition="slide"
      scrim="blur"
      label="Settings"
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      <div
        data-demo-settings=""
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--jg-space-md, 12px)",
          width: "min(92vw, 620px)",
          maxHeight: "80vh",
          padding: "var(--jg-space-lg, 16px)",
          borderRadius: 14,
          background: "var(--jg-surface, rgba(16,20,26,0.92))",
          border: "1px solid var(--jg-edge, rgba(255,255,255,0.12))",
          boxShadow: "var(--jg-elevation-modal, 0 24px 56px rgba(0,0,0,0.6))",
          pointerEvents: "auto",
        }}
        {...nav.containerProps}
      >
        <h2 style={settingsHeading}>Settings</h2>
        <SettingsTabs
          categories={settings.categories}
          activeId={category?.id ?? ""}
          onSelect={(id) => settingsTabStore.set(id)}
          tabProps={nav.itemProps}
        />
        <div style={{ overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
          {category === null ? null : <SettingsSection category={category} heading={false} />}
        </div>
        <span data-jg-kbd-hint="" style={{ fontSize: "var(--jg-type-xs, 12px)", color: "var(--jg-text-dim, #94a3a0)" }}>
          ← → category · Esc back
        </span>
      </div>
    </MenuScreen>
  );
}

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
          { id: "settings", label: "Settings", hint: "Composed from the shipped settings blocks" },
          { id: "credits", label: "Credits", hint: "Ships with the save screen", disabled: true },
        ]}
        onSelect={(id) => {
          if (id === "new") screenStore.set("play");
          else if (id === "settings") screenStore.openSettings("title");
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
            { id: "settings", label: "Settings", onSelect: () => screenStore.openSettings("paused") },
            { id: "title", label: "Quit to title", danger: true, onSelect: () => screenStore.set("title") },
          ]}
        />
      </MenuScreen>

      <DemoSettings open={screen === "settings"} />
    </div>
  );
}

function onInit(ctx: GameContext): void {
  ctx.game.commands.define("menu.play", { apply: (state) => { screenStore.set("play"); return state; } });
  ctx.game.commands.define("menu.pause", { apply: (state) => { screenStore.set("paused"); return state; } });
  ctx.game.commands.define("menu.title", { apply: (state) => { screenStore.set("title"); return state; } });
  ctx.game.commands.define("menu.settings", { apply: (state) => { settingsTabStore.set(""); screenStore.openSettings("title"); return state; } });
  ctx.game.commands.define("menu.settingsAccessibility", { apply: (state) => { settingsTabStore.set("accessibility"); screenStore.openSettings("title"); return state; } });
}

export const menuFrameworkDemoGame: PlayableGame = {
  game,
  content: { entityById: () => null, objectById: () => null },
  loop: { onInit, onNewPlayer: () => {}, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: MenuFrameworkUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 30, initialHeight: 22, minDistance: 14, maxDistance: 60, targetHeight: 0, maxPolarAngle: 1.32 },
  settings: {
    variant: "panel",
    extra: [{ id: "demo.hints", label: "Show hints", category: "gameplay", kind: "toggle", default: true }],
  },
  capture: {
    states: {
      title: [{ name: "menu.title" }],
      play: [{ name: "menu.play" }],
      pause: [{ name: "menu.play" }, { name: "menu.pause" }],
      settings: [{ name: "menu.settings" }],
      settingsAccessibility: [{ name: "menu.settingsAccessibility" }],
    },
    views: {
      title: { description: "Title screen over the live 3D scene", settleMs: 400 },
      pause: { description: "Pause screen over live play", state: "pause", settleMs: 400 },
      settings: { description: "Game-composed settings screen", state: "settings", settleMs: 400 },
      accessibility: { description: "Accessibility category of the game-composed settings screen", state: "settingsAccessibility", settleMs: 400 },
    },
  },
};
