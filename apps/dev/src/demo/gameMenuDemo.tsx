import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createGameSave } from "@jgengine/core/game/gameSave";
import { createSaveSlots } from "@jgengine/core/game/saveSlots";
import { formatSavePlaytime, gameSaveSlotSource, refreshSaveSlots } from "@jgengine/core/game/saveSlotIndex";
import { localSaveBackend } from "@jgengine/core/game/saveStore";
import { mergeCredits } from "@jgengine/core/game/credits";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import type { GameContext } from "@jgengine/core/runtime/gameContext";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { ContinuePane, CreditsPane, GameMenu, GamePauseMenu, NewCharacterPane, SaveSlotsPane } from "@jgengine/react";
import { shrinkCapture } from "@jgengine/react/saveThumbnail";
import { useSettings } from "@jgengine/react/settings";
import { SettingsSection, SettingsTabs } from "@jgengine/react/settingsBlocks";
import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import { SceneCaptureBinding } from "@jgengine/shell/render/sceneCapture";
import type { PlayableGame } from "@jgengine/shell/registry";

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 80, d: 80 }, height: 3.2, frequency: 0.028, seed: "game-menu" }),
  vegetation: grass({ area: { w: 72, d: 72 }, density: 3, colors: ["#1d3a2a", "#7fae45"], seed: "game-menu" }),
});

const game = defineGameDefinition({
  name: "game-menu",
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
    highlight: null as string | null,
  };
})();

const progress = { waves: 0 };
const playtime = { seconds: 0 };
const save = createGameSave({
  backend: localSaveBackend(),
  game: "game-menu-demo",
  slot: "slot-1",
  playtime: () => playtime.seconds,
});
save.register({
  name: "run",
  snapshot: () => ({ seconds: playtime.seconds, waves: progress.waves }),
  restore: (next) => {
    const value = next as { seconds: number; waves: number };
    playtime.seconds = value.seconds;
    progress.waves = value.waves;
  },
  reset: () => {
    playtime.seconds = 0;
    progress.waves = 0;
  },
});

const SLOT_NAMES: Record<string, string> = { "slot-1": "Mara Vell" };
const slotIndex = createSaveSlots({
  capacity: 3,
  slots: [
    { id: "slot-1", empty: true, meta: {} },
    { id: "slot-2", empty: true, meta: {} },
    { id: "slot-3", empty: true, meta: {} },
  ],
});
const slotOptions = {
  nameOf: (slot: string) => SLOT_NAMES[slot] ?? slot,
  metaOf: (_slot: string, document: { playtime: number }) => ({
    character: SLOT_NAMES["slot-1"] ?? "Wanderer",
    waves: Math.max(1, progress.waves),
    playtime: formatSavePlaytime(document.playtime),
  }),
};

const credits = mergeCredits(
  {
    title: "Game Menu",
    sections: [
      { heading: "Engine", entries: [{ label: "JGengine", detail: "menu, saves, input, sound" }] },
      { heading: "Scene", entries: [{ label: "Procedural terrain and grass", detail: "engine features" }] },
    ],
    notice: "Demo content only — no third-party assets ship in this scene.",
  },
  { sections: [{ heading: "Thanks", entries: [{ label: "Every game that hand-rolled a menu panel before this block existed" }] }] },
);

const PALETTES = [
  { id: "dusk", label: "Dusk", colors: ["#7dd3fc", "#1e3a5f", "#f0abfc"] },
  { id: "moss", label: "Moss", colors: ["#a3e635", "#14532d", "#fde68a"] },
  { id: "ember", label: "Ember", colors: ["#fb923c", "#7c2d12", "#fca5a5"] },
];
const AVATARS = [
  { id: "warden", label: "Warden", glyph: "W" },
  { id: "scout", label: "Scout", glyph: "S" },
  { id: "mason", label: "Mason", glyph: "M" },
];

const captureRef: { current: (() => string | null) | null } = { current: null };

/**
 * Authored key art for the demo: a still-horizon wall, two beacon glows and a slow drift. A real
 * game passes its own `art` image or leaves the live 3D scene behind the menu; this keeps the demo
 * readable when it is captured headless, where WebGL is not drawn.
 */
function DemoKeyArt(): ReactNode {
  return (
    <div data-demo-key-art="" style={{ position: "absolute", inset: "-6%", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, #0b1622 0%, #14283a 42%, #1d3a44 62%, #10202a 78%, #08111a 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "52%",
          top: "22%",
          width: 620,
          height: 620,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(125,211,252,0.42), rgba(125,211,252,0) 62%)",
          filter: "blur(6px)",
          animation: "jg-pulse 7s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "18%",
          bottom: "-6%",
          width: 900,
          height: 320,
          background: "linear-gradient(180deg, #22404a, #0c1a22)",
          clipPath: "polygon(0 100%, 0 42%, 14% 30%, 26% 46%, 40% 26%, 58% 44%, 72% 22%, 88% 40%, 100% 32%, 100% 100%)",
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: "-4%",
          bottom: "-8%",
          width: 780,
          height: 260,
          background: "linear-gradient(180deg, #2c5058, #0a161d)",
          clipPath: "polygon(0 100%, 0 54%, 18% 34%, 34% 52%, 52% 30%, 70% 48%, 86% 26%, 100% 44%, 100% 100%)",
          opacity: 0.75,
        }}
      />
    </div>
  );
}


async function writeSave(name: string, thumbnail: string | null): Promise<void> {
  await save.switchSlot("slot-1");
  SLOT_NAMES["slot-1"] = name;
  const capture = captureRef.current;
  const shot = thumbnail ?? (capture === null ? null : await shrinkCapture(capture(), { width: 320, height: 180 }));
  slotIndex.write("slot-1", {
    name,
    meta: {
      character: name,
      playtime: formatSavePlaytime(playtime.seconds),
      waves: Math.max(1, progress.waves),
      ...(shot === null ? {} : { thumbnail: shot }),
    },
  });
  await save.save();
  await refreshSaveSlots(gameSaveSlotSource(save), slotIndex, slotOptions);
  const written = slotIndex.get("slot-1");
  if (written !== null && shot !== null) slotIndex.write("slot-1", { meta: { ...written.meta, thumbnail: shot } });
}

function SettingsBody(): ReactNode {
  const settings = useSettings();
  const ids = useMemo(() => settings.categories.map((category) => category.id), [settings.categories]);
  const [activeId, setActiveId] = useState(ids[0] ?? "");
  const category = settings.categories.find((candidate) => candidate.id === activeId) ?? settings.categories[0] ?? null;
  return (
    <div data-demo-settings="" style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, flex: 1 }}>
      <div style={{ fontFamily: "var(--jg-font-display, inherit)", fontSize: "var(--jg-type-xxl, 26px)", fontWeight: 800 }}>
        Settings
      </div>
      <SettingsTabs categories={settings.categories} activeId={activeId} onSelect={setActiveId} />
      <div style={{ overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
        {category === null ? null : <SettingsSection category={category} heading={false} />}
      </div>
    </div>
  );
}

function GameMenuDemoUI(): ReactNode {
  const screen = useSyncExternalStore(screenStore.subscribe, screenStore.get, screenStore.get);
  const [recent, setRecent] = useState(() => slotIndex.mostRecent());
  const [name, setName] = useState("Mara Vell");
  const [paletteId, setPaletteId] = useState(PALETTES[0]!.id);
  const [avatarId, setAvatarId] = useState(AVATARS[0]!.id);
  const focusId = screenStore.highlight;
  const playing = screen === "play";

  useEffect(() => {
    void refreshSaveSlots(gameSaveSlotSource(save), slotIndex, slotOptions).then(() => setRecent(slotIndex.mostRecent()));
    return slotIndex.subscribe(() => setRecent(slotIndex.mostRecent()));
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      playtime.seconds += 3;
      if (Math.floor(playtime.seconds / 30) > progress.waves) progress.waves += 1;
    }, 3000);
    return () => clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== "Escape") return;
      if (screenStore.get() === "play") screenStore.set("paused");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const resume = (slotId: string): void => {
    void save.switchSlot(slotId).then(() => {
      void refreshSaveSlots(gameSaveSlotSource(save), slotIndex, slotOptions).then(() => setRecent(slotIndex.mostRecent()));
      screenStore.set("play");
    });
  };

  const detailFor = (id: string | null): ReactNode => {
    switch (id) {
      case "continue":
        return <ContinuePane slot={recent} onContinue={(slot) => resume(slot.id)} />;
      case "new":
        return (
          <NewCharacterPane
            name={name}
            onNameChange={setName}
            palettes={PALETTES}
            paletteId={paletteId}
            onPaletteChange={setPaletteId}
            avatars={AVATARS}
            avatarId={avatarId}
            onAvatarChange={setAvatarId}
            heading="New defense"
            nameLabel="Commander name"
            startLabel="Take the wall"
            onStart={(choice) => {
              SLOT_NAMES["slot-1"] = choice.name;
              playtime.seconds = 0;
              progress.waves = 0;
              void writeSave(choice.name, null).then(() => screenStore.set("play"));
            }}
          />
        );
      case "load":
        return (
          <SaveSlotsPane
            model={slotIndex}
            heading="Saves"
            now={() => Date.now()}
            onContinue={(slot) => resume(slot.id)}
            onLoad={(slot) => resume(slot.id)}
            onNew={(slot) => {
              SLOT_NAMES[slot.id] = name;
              playtime.seconds = 0;
              progress.waves = 0;
              void save.switchSlot(slot.id).then(() => screenStore.set("play"));
            }}
            onDelete={(slot) => {
              slotIndex.clear(slot.id);
              void save.deleteSlot(slot.id).then(() => setRecent(slotIndex.mostRecent()));
            }}
          />
        );
      case "settings":
        return <SettingsBody />;
      case "credits":
        return <CreditsPane sections={credits.sections} notice={credits.notice} />;
      default:
        return null;
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      {playing ? (
        <div
          data-demo-hint=""
          style={{
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
            zIndex: 5,
          }}
        >
          Playing — Esc pauses
        </div>
      ) : null}

      <div style={{ position: "absolute", inset: 0, pointerEvents: screen === "title" ? "auto" : "none" }}>
        <GameMenu
          key={`title-${focusId ?? ""}-${recent?.id ?? "none"}`}
          open={screen === "title"}
          initialId={focusId ?? (recent === null ? "new" : "continue")}
          background={<DemoKeyArt />}
          logo={{ text: "Beacon Bastion", title: "Beacon Bastion" }}
          eyebrow="Front-end demo"
          tagline="A live scene behind the menu, a detail pane per verb, and saves that resume a real character."
          items={[
            { id: "continue", label: "Continue", hint: recent === null ? "No run saved yet" : `${recent.name ?? recent.id} · ${String(recent.meta.playtime ?? "")}`, disabled: recent === null },
            { id: "new", label: "New defense", hint: "Name a commander and take the wall" },
            { id: "load", label: "Load & save", hint: `${slotIndex.list().filter((slot) => !slot.empty).length} of 3 slots used` },
            { id: "settings", label: "Settings" },
            { id: "credits", label: "Credits" },
          ]}
          detail={detailFor}
          onHighlight={(id) => {
            if (id === "load") void refreshSaveSlots(gameSaveSlotSource(save), slotIndex, slotOptions);
          }}
          onSelect={(id) => {
            if (id === "new") {
              document.querySelector<HTMLInputElement>("[data-new-character-name]")?.focus();
              return;
            }
            if (id === "continue" && recent !== null) return resume(recent.id);
            if (id === "load") {
              document.querySelector<HTMLButtonElement>("[data-save-slot-load]")?.focus();
              return;
            }
            if (id === "credits") {
              document.querySelector<HTMLElement>("[data-credits-scroller]")?.focus();
              return;
            }
          }}
          footer="game-menu demo · v0.0.0"
        />
      </div>

      <div style={{ position: "absolute", inset: 0, pointerEvents: screen === "paused" ? "auto" : "none" }}>
        <GamePauseMenu
          open={screen === "paused"}
          logo={{ text: "Beacon Bastion", title: "Beacon Bastion" }}
          items={[
            { id: "resume", label: "Resume" },
            { id: "save", label: "Save game", hint: `${formatSavePlaytime(playtime.seconds)} played` },
            { id: "settings", label: "Settings" },
          ]}
          secondary={[{ id: "title", label: "Quit to title" }]}
          detail={(id) => (id === "settings" ? <SettingsBody /> : null)}
          onResume={() => screenStore.set("play")}
          onSelect={(id) => {
            if (id === "resume") screenStore.set("play");
            else if (id === "save") {
              void writeSave(name, null).then(() => setRecent(slotIndex.mostRecent()));
            } else if (id === "title") screenStore.set("title");
          }}
        />
      </div>
    </div>
  );
}

function onInit(ctx: GameContext): void {
  ctx.game.commands.define("menu.play", { apply: (state) => { screenStore.set("play"); return state; } });
  ctx.game.commands.define("menu.pause", { apply: (state) => { screenStore.set("paused"); return state; } });
  ctx.game.commands.define("menu.title", { apply: (state) => { screenStore.set("title"); return state; } });
  ctx.game.commands.define("menu.focusNew", { apply: (state) => { screenStore.highlight = "new"; screenStore.set("title"); return state; } });
  ctx.game.commands.define("menu.focusLoad", { apply: (state) => { screenStore.highlight = "load"; screenStore.set("title"); return state; } });
  ctx.game.commands.define("menu.focusCredits", { apply: (state) => { screenStore.highlight = "credits"; screenStore.set("title"); return state; } });
  ctx.game.commands.define("menu.seedSave", {
    apply: (state) => {
      playtime.seconds = 4287;
      progress.waves = 12;
      void writeSave("Mara Vell", null).then(() => screenStore.set("title"));
      return state;
    },
  });
}

export const gameMenuDemoGame: PlayableGame = {
  game,
  content: { entityById: () => null, objectById: () => null },
  loop: { onInit, onNewPlayer: () => {}, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: GameMenuDemoUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  WorldOverlay: () => <SceneCaptureBinding bind={(capture) => { captureRef.current = capture; }} />,
  camera: { initialDistance: 30, initialHeight: 22, minDistance: 14, maxDistance: 60, targetHeight: 0, maxPolarAngle: 1.32 },
  settings: { variant: "panel" },
  capture: {
    states: {
      title: [{ name: "menu.seedSave" }],
      character: [{ name: "menu.seedSave" }, { name: "menu.focusNew" }],
      saves: [{ name: "menu.seedSave" }, { name: "menu.focusLoad" }],
      credits: [{ name: "menu.seedSave" }, { name: "menu.focusCredits" }],
      pause: [{ name: "menu.play" }, { name: "menu.pause" }],
    },
    views: {
      title: { description: "Title menu over the live scene, Continue highlighted", settleMs: 1400 },
      character: { description: "Character creation pane", state: "character", settleMs: 1400 },
      saves: { description: "Slot grid with a real save", state: "saves", settleMs: 1600 },
      credits: { description: "Credits scroller pane", state: "credits", settleMs: 1400 },
      pause: { description: "Pause menu from the same system", state: "pause", settleMs: 900 },
    },
  },
};



