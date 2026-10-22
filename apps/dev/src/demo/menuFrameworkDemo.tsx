import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameSave } from "@jgengine/core/game/gameSave";
import { createSaveSlots } from "@jgengine/core/game/saveSlots";
import { gameSaveSlotSource, refreshSaveSlots } from "@jgengine/core/game/saveSlotIndex";
import { memorySaveBackend } from "@jgengine/core/game/saveStore";
import { mergeCredits } from "@jgengine/core/game/credits";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { CreditsPanel } from "@jgengine/react/creditsPanel";
import { LoadingScreen } from "@jgengine/react/loadingScreen";
import { MenuScreen } from "@jgengine/react/menuScreen";
import { useMenuNav } from "@jgengine/react/menuNav";
import { PauseMenu } from "@jgengine/react/modals";
import { SaveSlotMenu } from "@jgengine/react/saveSlots";
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

const playtime = { seconds: 0 };
const saveBackend = memorySaveBackend();
const save = createGameSave({
  backend: saveBackend,
  game: "menu-framework",
  slot: "slot-1",
  playtime: () => playtime.seconds,
});
save.register({
  name: "run",
  snapshot: () => ({ seconds: playtime.seconds }),
  restore: (next) => {
    playtime.seconds = (next as { seconds: number }).seconds;
  },
  reset: () => {
    playtime.seconds = 0;
  },
});
const slotOptions = { nameOf: (slot: string) => (slot === "slot-1" ? "Mara" : slot) };
const slotIndex = createSaveSlots({
  capacity: 3,
  slots: [
    { id: "slot-1", empty: true, meta: {} },
    { id: "slot-2", empty: true, meta: {} },
    { id: "slot-3", empty: true, meta: {} },
  ],
});

const credits = mergeCredits(
  {
    title: "Menu Framework",
    sections: [
      { heading: "Engine", entries: [{ label: "JGengine", detail: "engine, menus, saves" }] },
      { heading: "Scene", entries: [{ label: "Procedural terrain and grass", detail: "engine features" }] },
    ],
    notice: "Demo content only — no third-party assets are shipped in this scene.",
  },
  { sections: [{ heading: "Thanks", entries: [{ label: "Every game that re-authored a menu before this block existed" }] }] },
);

const TIPS = [
  "Continue and New Game are different slots — a save is never overwritten by accident.",
  "Settings opens from the title and from pause; both reach the same store.",
  "Every menu here answers to the d-pad and the arrow keys.",
];

type Screen = "loading" | "title" | "play" | "paused" | "settings" | "saves" | "credits";

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
  let screen: Screen = "loading";
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
    openOver(from: Screen, target: Screen) {
      returnTo = from;
      if (screen !== target) {
        screen = target;
        notify();
      }
    },
    closeOverlay() {
      if (screen !== "settings" && screen !== "saves" && screen !== "credits") return;
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

const panelHeading: CSSProperties = {
  margin: 0,
  fontFamily: "var(--jg-font-display, inherit)",
  fontSize: "var(--jg-type-xl, 20px)",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--jg-text, #f5f7fa)",
};

function DemoSettings({ open }: { open: boolean }): ReactNode {
  const settings = useSettings();
  const ids = useMemo(() => settings.categories.map((category) => category.id), [settings.categories]);
  const preferred = useSyncExternalStore(settingsTabStore.subscribe, settingsTabStore.get, settingsTabStore.get);
  const activeId = preferred !== "" && ids.includes(preferred) ? preferred : (ids[0] ?? "");
  const nav = useMenuNav({
    ids,
    columns: Math.max(1, ids.length),
    enabled: open && ids.length > 0,
    onConfirm: (id) => settingsTabStore.set(id),
    onBack: () => screenStore.closeOverlay(),
  });
  const category = settings.categories.find((candidate) => candidate.id === activeId) ?? null;

  return (
    <MenuScreen open={open} transition="slide" scrim="blur" label="Settings" style={{ pointerEvents: open ? "auto" : "none" }}>
      <div
        data-demo-settings=""
        {...nav.containerProps}
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
      >
        <h2 style={panelHeading}>Settings</h2>
        <SettingsTabs
          categories={settings.categories}
          activeId={activeId}
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

function DemoSaves({ open }: { open: boolean }): ReactNode {
  useEffect(() => {
    if (open) void refreshSaveSlots(gameSaveSlotSource(save), slotIndex, slotOptions);
  }, [open]);
  return (
    <MenuScreen open={open} transition="slide" scrim="blur" label="Save slots" style={{ pointerEvents: open ? "auto" : "none" }}>
      <div
        data-demo-saves=""
        style={{
          padding: "var(--jg-space-lg, 16px)",
          borderRadius: 14,
          background: "var(--jg-surface, rgba(16,20,26,0.92))",
          border: "1px solid var(--jg-edge, rgba(255,255,255,0.12))",
          pointerEvents: "auto",
        }}
      >
        <SaveSlotMenu
          model={slotIndex}
          title="Saves"
          onLoad={(slot) => {
            void save.switchSlot(slot.id).then(() => screenStore.set("play"));
          }}
          onContinue={(slot) => {
            void save.switchSlot(slot.id).then(() => screenStore.set("play"));
          }}
          onNew={(slot) => {
            void save.switchSlot(slot.id).then(async () => {
              playtime.seconds = 0;
              await save.save();
              void refreshSaveSlots(gameSaveSlotSource(save), slotIndex, slotOptions);
              screenStore.set("play");
            });
          }}
        />
      </div>
    </MenuScreen>
  );
}

function DemoLoading({ open }: { open: boolean }): ReactNode {
  const [state, setState] = useState({ progress: 0, ready: false });
  useEffect(() => {
    if (!open) {
      setState({ progress: 0, ready: false });
      return;
    }
    const timer = setInterval(() => {
      setState((current) => {
        const progress = Math.min(1, current.progress + 0.18);
        return { progress, ready: progress >= 1 };
      });
    }, 120);
    return () => clearInterval(timer);
  }, [open]);
  return (
    <LoadingScreen
      open={open}
      progress={state.progress}
      ready={state.ready}
      title="Entering the Bastion"
      tips={TIPS}
      tipIntervalMs={2400}
      onReady={() => screenStore.set("title")}
      onSkip={() => screenStore.set("title")}
    />
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

  const [recent, setRecent] = useState(() => slotIndex.mostRecent());
  useEffect(() => slotIndex.subscribe(() => setRecent(slotIndex.mostRecent())), []);

  useEffect(() => {
    if (screen === "loading") return;
    void refreshSaveSlots(gameSaveSlotSource(save), slotIndex, slotOptions);
  }, [screen]);

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <DemoLoading open={screen === "loading"} />

      <TitleMenu
        open={screen === "title"}
        title="Menu Framework"
        eyebrow="Engine demo"
        tagline="A live 3D scene behind an animated, keyboard and gamepad navigable front-end."
        items={[
          {
            id: "continue",
            label: "Continue",
            primary: true,
            hint: recent === null ? "No saved run yet" : `Slot ${recent.name ?? recent.id} · ${String(recent.meta.playtime ?? "")}`,
            disabled: recent === null,
          },
          { id: "new", label: "New Game", hint: "Start in the first free slot" },
          { id: "saves", label: "Load / Save", hint: "Slot list wired to the save document" },
          { id: "settings", label: "Settings", hint: "Composed from the shipped settings blocks" },
          { id: "credits", label: "Credits" },
        ]}
        onSelect={(id) => {
          if (id === "new") {
            screenStore.set("play");
            playtime.seconds = 0;
            void save.switchSlot("slot-1").then(() => save.save());
          } else if (id === "continue" && recent !== null) {
            void save.switchSlot(recent.id).then(() => screenStore.set("play"));
          } else if (id === "saves") screenStore.openOver("title", "saves");
          else if (id === "settings") screenStore.openSettings("title");
          else if (id === "credits") screenStore.openOver("title", "credits");
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
            { id: "save", label: "Save game", onSelect: () => { void save.save().then(() => refreshSaveSlots(gameSaveSlotSource(save), slotIndex, slotOptions)); } },
            { id: "saves", label: "Load / Save slot", onSelect: () => screenStore.openOver("paused", "saves") },
            { id: "settings", label: "Settings", onSelect: () => screenStore.openSettings("paused") },
            { id: "title", label: "Quit to title", danger: true, onSelect: () => screenStore.set("title") },
          ]}
        />
      </MenuScreen>

      <DemoSettings open={screen === "settings"} />
      <DemoSaves open={screen === "saves"} />
      <CreditsPanel
        open={screen === "credits"}
        document={credits}
        onBack={() => screenStore.closeOverlay()}
        style={{ pointerEvents: screen === "credits" ? "auto" : "none" }}
      />
    </div>
  );
}

function onInit(ctx: GameContext): void {
  ctx.game.commands.define("menu.play", { apply: (state) => { screenStore.set("play"); return state; } });
  ctx.game.commands.define("menu.pause", { apply: (state) => { screenStore.set("paused"); return state; } });
  ctx.game.commands.define("menu.title", { apply: (state) => { screenStore.set("title"); return state; } });
  ctx.game.commands.define("menu.loading", { apply: (state) => { screenStore.set("loading"); return state; } });
  ctx.game.commands.define("menu.settings", { apply: (state) => { settingsTabStore.set(""); screenStore.openSettings("title"); return state; } });
  ctx.game.commands.define("menu.settingsAccessibility", { apply: (state) => { settingsTabStore.set("accessibility"); screenStore.openSettings("title"); return state; } });
  ctx.game.commands.define("menu.saves", { apply: (state) => { screenStore.openOver("title", "saves"); return state; } });
  ctx.game.commands.define("menu.credits", { apply: (state) => { screenStore.openOver("title", "credits"); return state; } });
  ctx.game.commands.define("menu.seedSave", {
    apply: (state) => {
      void save.switchSlot("slot-1").then(async () => {
        playtime.seconds = 4_200;
        await save.save();
        await refreshSaveSlots(gameSaveSlotSource(save), slotIndex, slotOptions);
      });
      return state;
    },
  });
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
      saves: [{ name: "menu.saves" }],
      savesFilled: [{ name: "menu.seedSave" }, { name: "menu.saves" }],
      titleSaved: [{ name: "menu.seedSave" }, { name: "menu.title" }],
      credits: [{ name: "menu.credits" }],
      loading: [{ name: "menu.loading" }],
    },
    views: {
      title: { description: "Title screen over the live 3D scene", settleMs: 400 },
      pause: { description: "Pause screen over live play", state: "pause", settleMs: 400 },
      settings: { description: "Game-composed settings screen", state: "settings", settleMs: 400 },
      accessibility: { description: "Accessibility category of the game-composed settings screen", state: "settingsAccessibility", settleMs: 400 },
      saves: { description: "Save slots read from the save documents", state: "saves", settleMs: 600 },
      savesFilled: { description: "A written save slot with its playtime chip", state: "savesFilled", settleMs: 1200 },
      titleSaved: { description: "Title with Continue enabled by a real save", state: "titleSaved", settleMs: 1200 },
      credits: { description: "Credits panel", state: "credits", settleMs: 400 },
      loading: { description: "Loading screen with a rotating tip", state: "loading", settleMs: 900 },
    },
  },
};
