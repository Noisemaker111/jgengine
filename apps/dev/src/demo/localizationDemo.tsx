import { useSyncExternalStore } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createI18n, type Catalog, type I18n } from "@jgengine/core/i18n/i18n";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { I18nProvider, useLocale, usePlural, useT } from "@jgengine/react/i18n";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const SCOUT = "scout";

const CATALOG: Catalog = {
  en: {
    "app.title": "Frontier Outpost",
    "app.subtitle": "Localization demo",
    "hud.score": "Score: {value}",
    "hud.language": "Language",
    "hud.hint": "Switch language — every HUD string is bound to the message catalog.",
    "enemies.zero": "Sector clear",
    "enemies.one": "{count} raider inbound",
    "enemies.other": "{count} raiders inbound",
  },
  es: {
    "app.title": "Puesto Fronterizo",
    "app.subtitle": "Demostración de localización",
    "hud.score": "Puntuación: {value}",
    "hud.language": "Idioma",
    "hud.hint": "Cambia el idioma — cada texto del HUD viene del catálogo de mensajes.",
    "enemies.zero": "Sector despejado",
    "enemies.one": "{count} asaltante en camino",
    "enemies.other": "{count} asaltantes en camino",
  },
  ja: {
    "app.title": "辺境の前哨基地",
    "app.subtitle": "ローカライズのデモ",
    "hud.score": "スコア: {value}",
    "hud.language": "言語",
    "hud.hint": "言語を切り替え — HUD の文字はすべてメッセージカタログから来ています。",
    "enemies.other": "敵 {count} 体が接近中",
  },
};

const LOCALES: readonly { id: string; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "es", label: "ES" },
  { id: "ja", label: "日本語" },
];

const i18n: I18n = createI18n({ catalog: CATALOG, locale: "en", fallbackLocale: "en" });

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 80, d: 80 }, height: 3, frequency: 0.03, seed: "l10n" }),
  vegetation: grass({ area: { w: 68, d: 68 }, density: 3, colors: ["#2f4f1e", "#8fbf4a"], seed: "l10n" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [SCOUT]: { movement: { walkSpeed: 6 }, role: "player" },
};

let raiders = 3;
let elapsed = 0;
const listeners = new Set<() => void>();
function setRaiders(next: number): void {
  if (next === raiders) return;
  raiders = next;
  for (const listener of listeners) listener();
}

const game = defineGameDefinition({
  name: "localization",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onInit(): void {
  raiders = 3;
  elapsed = 0;
}

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(SCOUT, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function onTick(_ctx: GameContext, dt: number): void {
  elapsed += dt;
  // Cycle the raider count 3 → 0 to show plural (and zero) forms live.
  setRaiders(Math.floor(elapsed) % 4);
}

function useRaiders(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => raiders,
    () => raiders,
  );
}

function LanguageSwitcher() {
  const locale = useLocale();
  return (
    <div className="pointer-events-auto flex gap-1 rounded-md border border-white/15 bg-neutral-900/85 p-1">
      {LOCALES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => i18n.setLocale(entry.id)}
          className={`rounded px-2 py-1 text-[12px] font-semibold ${
            locale === entry.id ? "bg-sky-400/25 text-sky-200" : "text-white/55 hover:text-white/80"
          }`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

function LocalizationHud() {
  const t = useT();
  const plural = usePlural();
  const raiderCount = useRaiders();
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="absolute left-4 top-4 rounded-lg border border-sky-300/25 bg-neutral-900/85 px-4 py-3 shadow-xl backdrop-blur-sm">
        <h1 className="text-base font-semibold tracking-wide text-sky-200">{t("app.title")}</h1>
        <p className="text-xs text-white/60">{t("app.subtitle")}</p>
        <div className="mt-2 text-sm text-white/85">{t("hud.score", { value: 1280 })}</div>
        <div className="text-sm font-semibold text-amber-200">{plural("enemies", raiderCount)}</div>
      </div>
      <div className="absolute right-4 top-4 flex flex-col items-end gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45">{t("hud.language")}</span>
        <LanguageSwitcher />
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-white/15 bg-neutral-900/80 px-3 py-2 text-[11px] text-white/70">
        {t("hud.hint")}
      </div>
    </div>
  );
}

function LocalizationUI() {
  return (
    <I18nProvider i18n={i18n}>
      <LocalizationHud />
    </I18nProvider>
  );
}

export const localizationDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit, onNewPlayer, onTick, onReset: () => {}, onDispose: () => {} },
  GameUI: LocalizationUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 30, initialHeight: 24, minDistance: 12, maxDistance: 60, targetHeight: 0, maxPolarAngle: 1.3 },
};
