import { useState, type ReactNode } from "react";

import { defineGameDefinition } from "@jgengine/core/game/defineGame";
import { createShopStock, type ShopStockEntry } from "@jgengine/core/economy/shopStock";
import { createEmptyWallet, grant, type WalletState } from "@jgengine/core/economy/wallet";
import type { GameContext, GameContextEntityEntry } from "@jgengine/core/runtime/gameContext";
import { createAssetCatalog } from "@jgengine/core/scene/assetCatalog";
import { environment, grass, terrain } from "@jgengine/core/world/features";
import { ShopGrid } from "@jgengine/react/shopGrid";
import { hudThemeVars, HUD_THEME_PRESETS } from "@jgengine/react/hudTheme";

import { EnvironmentScene } from "@jgengine/shell/environment/EnvironmentScene";
import type { PlayableGame } from "@jgengine/shell/registry";

const HERO = "hero";

// A vendor: free-string kinds, mixed currencies ("gold"/"gems"), some finite qty, one unlimited.
const STOCK: ShopStockEntry[] = [
  { id: "potion", kind: "potion", price: { currency: "gold", amount: 12 }, qty: 5, sellPrice: { currency: "gold", amount: 5 } },
  { id: "blade", kind: "blade", price: { currency: "gold", amount: 80 }, qty: 2, sellPrice: { currency: "gold", amount: 30 } },
  { id: "charm", kind: "charm", price: { currency: "gems", amount: 3 }, qty: null },
  { id: "tome", kind: "tome", price: { currency: "gold", amount: 45 }, qty: 3, sellPrice: { currency: "gold", amount: 18 } },
  { id: "shield", kind: "shield", price: { currency: "gold", amount: 150 }, qty: 1 },
  { id: "elixir", kind: "elixir", price: { currency: "gems", amount: 8 }, qty: 4, sellPrice: { currency: "gems", amount: 3 } },
];

const shop = createShopStock({ entries: STOCK });

// Starting purse: enough gold for most, but not the 150g shield or the 8-gem elixir — so the grid
// shows both affordable items and disabled (unaffordable) Buy buttons in a single frame.
const STARTING_WALLET: WalletState = grant(grant(createEmptyWallet(), "gold", 100), "gems", 6);

const terrainFeature = environment({
  terrain: terrain({ bounds: { w: 60, d: 60 }, height: 2, frequency: 0.03, seed: "shop" }),
  vegetation: grass({ area: { w: 52, d: 52 }, density: 3, colors: ["#26401a", "#7fb04a"], seed: "shop" }),
});

const entityCatalog: Record<string, GameContextEntityEntry> = {
  [HERO]: { movement: { walkSpeed: 6 }, role: "player" },
};

const game = defineGameDefinition({
  name: "shop-grid",
  assets: createAssetCatalog(),
  multiplayer: null,
  inventories: {},
  input: { moveForward: ["KeyW"], moveBack: ["KeyS"], moveLeft: ["KeyA"], moveRight: ["KeyD"] },
});

function onNewPlayer(ctx: GameContext): void {
  ctx.scene.entity.spawn(HERO, { id: ctx.player.userId, position: [0, 0, 0], role: "player" });
}

function ShopGridUI(): ReactNode {
  const [wallet, setWallet] = useState<WalletState>(STARTING_WALLET);
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(560px, 92vw)",
          ...hudThemeVars(HUD_THEME_PRESETS["arcane-stone"]),
        }}
      >
        <ShopGrid
          shop={shop}
          wallet={wallet}
          onWalletChange={setWallet}
          showSell
          walletCurrencies={["gold", "gems"]}
          title="Wandering Vendor"
        />
      </div>
    </div>
  );
}

export const shopGridDemoGame: PlayableGame = {
  game,
  content: { entityById: (catalogId) => entityCatalog[catalogId] ?? null, objectById: () => null },
  loop: { onInit: () => {}, onNewPlayer, onTick: () => {}, onReset: () => {}, onDispose: () => {} },
  GameUI: ShopGridUI,
  environment: () => <EnvironmentScene feature={terrainFeature} />,
  camera: { initialDistance: 26, initialHeight: 20, minDistance: 12, maxDistance: 52, targetHeight: 0, maxPolarAngle: 1.3 },
};
