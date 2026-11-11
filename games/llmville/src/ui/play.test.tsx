/** @jsxImportSource @jgengine/core/ui/jsx */
/**
 * LLMville played headless, end to end, on its one native surface. The real screens, HUD, chat,
 * tablet and apps mount as `proofs/runeUiFixture.tsx` mounts them; only the backend (Convex) and
 * the account service (better-auth) are stand-ins, a deterministic in-memory lab below. The test
 * presses actions by their label through `onPress`, types through `RuneField`'s edit and submit,
 * and checks the lab's state after each step, at a desktop and a phone viewport.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { getFunctionName, type FunctionReference } from "convex/server";
import { act, useMemo, useSyncExternalStore } from "@jgengine/core/ui/jsx";
import { Root } from "@jgengine/core/ui/jsx/reconciler";
import { RuneViewport } from "@jgengine/core/ui/rune/elements.view";
import { RuneNode, nativeEnabled, nativeLabel, nativeTreeHost, visibleNativeNodes } from "@jgengine/core/ui/rune/nativeTree";

import { BUILD_MENU_ITEMS, BUILD_MENU_TAB_SEQUENCE, getBuildMenuItemsForTab, type BuildMenuTabId, type PlacedBuildItem, type StorageItem } from "@llmville/game/build/build";
import { normalizeBuildInventory, type BuildItemId } from "@llmville/game/build/catalog";
import { STARTER_RACK_CATALOG_ID, getHardwareDefinition, type HardwareModelId } from "@llmville/game/infrastructure/catalog";
import { assignmentKey, getRackInstalledHardwareSlots, normalizeHardwareInventory, type ComputeAssignmentMap, type ComputeLane } from "@llmville/game/infrastructure/infrastructure";
import type { ChatMessage } from "@jgengine/core/chat/chat";
import { BASE_MODELS } from "@llmville/game/models/baseModels";
import { buildShopItems } from "@llmville/game/economy/storeTransition";

// --- the stand-in backend -------------------------------------------------------------------------

type Listener = () => void;

interface Bill { id: string; description: string; totalDue: number; type: "electricity" | "water" | "rent"; isOverdue: boolean; billingPeriod: string; lateFeeAccrued: number; gracePeriodDays: number }
interface Rack { id: string; rackType: typeof STARTER_RACK_CATALOG_ID; x: number; y: number; z: number; rotationY: number; createdAt: number; installedHardwareModuleIds: (HardwareModelId | null)[] }

const ACCOUNT = { email: "ada@example.com", password: "hunter2hunter2" };

/** One player's lab and account, deterministic, with a version the hooks subscribe to. */
class Lab {
  version = 0;
  private listeners = new Set<Listener>();
  session: { user: { id: string; email: string; name: string; isAnonymous: boolean } } | null = null;
  convexUser: { externalId: string; displayName: string; username: string } | null = null;
  userWorld: { _id: string } | null = null;
  money = 1_000_000;
  dataTokens = 5_000;
  hardwareInventory: Record<string, number> = {};
  buildInventory: Record<string, number> = {};
  racks: Rack[] = [{ id: "rack-1", rackType: STARTER_RACK_CATALOG_ID, x: 0, y: 0, z: 0, rotationY: 0, createdAt: 0, installedHardwareModuleIds: [] }];
  computeAssignments: ComputeAssignmentMap = {};
  modelCatalog: Record<string, { isUnlocked: boolean }> = {};
  researchUnlocks: Record<string, { isUnlocked: boolean }> = {};
  placedBuildItems: PlacedBuildItem[] = [];
  bills: Bill[] = [{ id: "bill-1", description: "Grid power", totalDue: 1_200, type: "electricity", isOverdue: false, billingPeriod: "June", lateFeeAccrued: 0, gracePeriodDays: 3 }];
  chat: ChatMessage[] = [{ id: "m-1", channelId: "world", fromUserId: "neighbor", fromLabel: "Grace", body: "Welcome to the block!", at: 1 }];
  storageTab: BuildMenuTabId = "all";
  storageIndex = 0;
  placing: BuildItemId | null = null;
  exits = 0;

  subscribe = (listener: Listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  read = () => this.version;
  publish() { this.version += 1; for (const listener of [...this.listeners]) listener(); }

  query(name: string, args: unknown): unknown {
    if (args === "skip") return undefined;
    switch (name) {
      case "user:getCurrentUser": return this.convexUser;
      case "world:getUserWorld": return this.userWorld;
      case "bills:list": return this.bills;
      case "multiplayer/worldChat:messages": return this.chat;
      case "multiplayer/worldPresence:communityProgress": return { launchedLabs: 3 };
      case "multiplayer/worldPresence:cityResidents": return [];
      case "bots:getMyBot": return null;
      case "world:listPlotBans": return [];
      default: throw new Error(`play test: no stand-in for query ${name}`);
    }
  }

  mutate(name: string, args: Record<string, unknown>): unknown {
    switch (name) {
      case "user:createOrUpdate":
        this.convexUser = { externalId: this.session?.user.id ?? "", displayName: "Ada", username: "ada" };
        break;
      case "world:bootstrapWorld":
        this.userWorld = { _id: "lab-ada" };
        this.publish();
        return { gameId: "lab-ada" };
      case "bills:pay": {
        const bill = this.bills.find((row) => row.id === args["billId"]);
        if (bill !== undefined) { this.money -= bill.totalDue; this.bills = this.bills.filter((row) => row !== bill); }
        break;
      }
      case "multiplayer/worldChat:sendMessage":
        this.chat = [...this.chat, { id: `m-${this.chat.length + 1}`, channelId: String(args["channelId"]), fromUserId: this.convexUser?.externalId ?? "", fromLabel: "Ada", body: String(args["body"]), at: this.chat.length + 1 }];
        break;
      default: throw new Error(`play test: no stand-in for mutation ${name}`);
    }
    this.publish();
    return null;
  }

  // The world's own commands, as the game's sessions hand them to the HUD.
  placeOrder(builds: readonly { itemId: string; quantity: number }[], hardware: readonly { hardwareModelId: string; quantity: number }[]): boolean {
    for (const { itemId, quantity } of builds) {
      const item = BUILD_MENU_ITEMS.find((candidate) => candidate.id === itemId);
      if (item === undefined) return false;
      this.money -= item.price * quantity;
      this.buildInventory = { ...this.buildInventory, [itemId]: (this.buildInventory[itemId] ?? 0) + quantity };
    }
    for (const { hardwareModelId, quantity } of hardware) {
      this.money -= getHardwareDefinition(hardwareModelId as HardwareModelId).buyPrice * quantity;
      this.hardwareInventory = { ...this.hardwareInventory, [hardwareModelId]: (this.hardwareInventory[hardwareModelId] ?? 0) + quantity };
    }
    this.publish();
    return true;
  }

  /** The store's catalog, as the backend's `store.catalog` query builds it from the lab's research. */
  shopItems() { return buildShopItems(this.researchUnlocks); }

  research(itemId: string): boolean {
    const cost = this.shopItems().find((item) => item.id === itemId)?.researchTokenCost ?? 0;
    if (this.dataTokens < cost) return false;
    this.dataTokens -= cost;
    this.researchUnlocks = { ...this.researchUnlocks, [itemId]: { isUnlocked: true } };
    this.publish();
    return true;
  }

  unlockModel(id: string, cost = 0) { this.money -= cost; this.modelCatalog = { ...this.modelCatalog, [id]: { isUnlocked: true } }; this.publish(); }

  installFromStock(rackId: string, hardwareId: HardwareModelId, slot: number) {
    this.racks = this.racks.map((rack) => {
      if (rack.id !== rackId) return rack;
      const slots = [...getRackInstalledHardwareSlots(rack)] as (HardwareModelId | null)[];
      slots[slot] = hardwareId;
      return { ...rack, installedHardwareModuleIds: slots };
    });
    this.hardwareInventory = { ...this.hardwareInventory, [hardwareId]: (this.hardwareInventory[hardwareId] ?? 0) - 1 };
    this.publish();
  }

  assign(rackId: string, slot: number, lane: ComputeLane) { this.computeAssignments = { ...this.computeAssignments, [assignmentKey(rackId, slot)]: { lane } }; this.publish(); }

  storageItems(): readonly StorageItem[] { return getBuildMenuItemsForTab(this.storageTab).filter((item) => (this.buildInventory[item.id] ?? 0) > 0); }

  confirmPlacement() {
    if (this.placing === null) return;
    const itemId = this.placing;
    this.placedBuildItems = [...this.placedBuildItems, { id: `placed-${this.placedBuildItems.length + 1}`, itemId, x: 2, y: 0, z: 2, direction: 0 } as PlacedBuildItem];
    this.buildInventory = { ...this.buildInventory, [itemId]: (this.buildInventory[itemId] ?? 0) - 1 };
    this.placing = null;
    this.publish();
  }
}

let lab = new Lab();
const nameOf = (reference: unknown) => getFunctionName(reference as FunctionReference<"query">);
const useLabVersion = () => useSyncExternalStore(lab.subscribe, lab.read, lab.read);

mock.module("convex/react", () => ({
  ConvexReactClient: class {},
  useConvex: () => ({}),
  useConvexAuth: () => { useLabVersion(); return { isAuthenticated: lab.session !== null, isLoading: false }; },
  useQuery: (reference: unknown, args: unknown) => { useLabVersion(); return lab.query(nameOf(reference), args); },
  useMutation: (reference: unknown) => async (args: Record<string, unknown> = {}) => lab.mutate(nameOf(reference), args),
  useAction: (reference: unknown) => async (args: Record<string, unknown> = {}) => lab.mutate(nameOf(reference), args),
}));

const authClient = {
  useSession: () => { useLabVersion(); return { data: lab.session, isPending: false }; },
  getSession: async () => ({ data: lab.session }),
  signIn: {
    email: async ({ email, password }: { email: string; password: string }) => {
      if (email !== ACCOUNT.email || password !== ACCOUNT.password) return { error: { message: "Invalid email or password" } };
      lab.session = { user: { id: "user-ada", email, name: "ada", isAnonymous: false } };
      lab.publish();
      return {};
    },
    anonymous: async () => ({ error: { message: "Guests are not part of this walk" } }),
    social: async () => ({ error: { message: "No Google here" } }),
  },
  signUp: { email: async () => ({ error: { message: "Sign-up is not part of this walk" } }) },
  signOut: async () => { lab.session = null; lab.publish(); },
  convex: { token: async () => ({ data: { token: null } }) },
};
mock.module("../auth/authClient", () => ({ authClient }));
mock.module("../auth/convexClient", () => ({ convexClient: {}, initialConvexToken: null }));
mock.module("../webEnv", () => ({ env: { VITE_CONVEX_URL: "http://convex.test", VITE_CONVEX_SITE_URL: "http://convex.site.test" } }));
// The world route's 3D session chunk is never loaded headless; the harness draws the world's UI itself.
mock.module("../runtime/gameRoutePreload", () => ({ loadGameSessionModule: async () => ({}), preloadGameRoute: () => undefined }));

// Only what the mounted UI touches of the page: storage for settings, key listeners for chat, pointer lock.
const memory = new Map<string, string>();
const pageGlobals = {
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); }, key: (index: number) => [...memory.keys()][index] ?? null, get length() { return memory.size; },
  },
  window: { addEventListener: () => undefined, removeEventListener: () => undefined, location: { origin: "http://llmville.test", assign: () => undefined } },
  document: {
    exitPointerLock: () => undefined, querySelector: () => null, getElementById: () => null, title: "LLMville",
    head: { querySelector: () => null, append: () => undefined },
    createElement: () => ({ setAttribute: () => undefined, content: "", href: "", rel: "" }),
  },
};
const saved = new Map<string, PropertyDescriptor | undefined>();
beforeAll(() => {
  for (const [key, value] of Object.entries(pageGlobals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});
afterAll(() => {
  for (const [key, descriptor] of saved) {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, key);
    else Object.defineProperty(globalThis, key, descriptor);
  }
});

const { AuthProvider } = await import("../auth");
const { Screens } = await import("../screens/screens");
const { matchScreenPath, memoryAddress, navigate, screenRouter, useScreenLocation } = await import("../screens/screenRouter");
const { GameOverlay } = await import("../runtime/components/GameOverlay");
const { TabletNavProvider } = await import("../tablet/components/tabletNav");
const { createTabletPreviewTutorial, createTabletPreviewWorld, usePreviewTabletNav } = await import("../tablet/tabletPreviewFixtures");
const { getAppSettingsSnapshot } = await import("../settings/settings");
// Each screen is its own lazy chunk; load them once up front so a press lands on the next screen within one settle.
await Promise.all([
  import("../branding/components/LandingPage"), import("../screens/authEntryScreen"), import("../user/authScreenPreload").then((module) => module.loadAuthScreenModule()),
  import("../runtime/components/DashboardScreen"), import("../screens/gameCreateScreen"),
]);
const { buildBaseModelLibrary } = await import("../models/training");
type TabletNav = ReturnType<typeof usePreviewTabletNav>["nav"];
type World = ReturnType<typeof createTabletPreviewWorld>;
type BuildVm = Parameters<typeof GameOverlay>[0]["build"];

// --- the world's UI over the lab --------------------------------------------------------------------

/** The tablet nav the world's keys drive (Tab toggles the tablet; E on a rack opens its menu). */
let keys: TabletNav | null = null;

function InWorld({ gameId, isTouch }: { gameId: string; isTouch: boolean }) {
  useLabVersion();
  const { nav } = usePreviewTabletNav({ initialOpen: false });
  keys = nav;
  const base = useMemo(createTabletPreviewWorld, []);
  const world: World = {
    ...base,
    routeGameId: gameId as World["routeGameId"],
    money: lab.money, dataTokens: lab.dataTokens,
    game: base.game == null ? base.game : { ...base.game, _id: base.game._id ?? (gameId as World["routeGameId"]), money: lab.money, dataTokens: lab.dataTokens, tutorialStage: "complete", researchUnlocks: lab.researchUnlocks },
    shopItems: lab.shopItems(),
    hardwareInventory: normalizeHardwareInventory(lab.hardwareInventory),
    buildInventory: normalizeBuildInventory(lab.buildInventory),
    racks: lab.racks, rackCount: lab.racks.length, worldRacks: lab.racks,
    computeAssignments: lab.computeAssignments,
    placedBuildItems: lab.placedBuildItems, worldPlacedBuildItems: lab.placedBuildItems,
    baseModelLibrary: buildBaseModelLibrary({ money: lab.money, dataTokens: lab.dataTokens, isTraining: false, modelCatalog: lab.modelCatalog }),
    onPlaceOrder: async (builds, hardware) => lab.placeOrder(builds, hardware),
    onUnlockResearch: async (itemId) => lab.research(itemId),
    onUnlockBaseModel: (id, cost) => lab.unlockModel(id, cost),
    onAssignCard: (rackId, slot, lane) => lab.assign(rackId, slot, lane),
    onSaveProgress: () => { lab.exits += 1; void navigate({ to: "/" }); },
  };
  const items = lab.storageItems();
  const selected = items[Math.min(lab.storageIndex, Math.max(0, items.length - 1))] ?? null;
  const build: BuildVm = {
    buildTabs: BUILD_MENU_TAB_SEQUENCE, activeBuildTab: lab.storageTab, activeBuildItems: items, buildInventory: normalizeBuildInventory(lab.buildInventory),
    selectedBuildItem: selected, selectedBuildItemIndex: lab.storageIndex, selectedBuildPriceLabel: "$0", buildPrimaryActionLabel: "Place",
    isBuildPrimaryActionDisabled: selected === null, isBuildTrashActionDisabled: selected === null,
    buildPlacementModeActive: lab.placing !== null, placementDraftItemId: lab.placing, placementDraftDirection: 0,
    placementPreview: lab.placing === null ? null : { x: 2, y: 0, z: 2, isValid: true }, placedBuildItems: lab.placedBuildItems,
    onBuildPrimaryAction: () => { if (selected === null) return; lab.placing = selected.id as BuildItemId; nav.closeMenu(); lab.publish(); },
    onBuildTrashAction: () => undefined, onConfirmPlacement: () => lab.confirmPlacement(), onPlacementPreviewChange: () => undefined,
    onCycleBuildTab: () => undefined, onSetBuildTab: (tab) => { lab.storageTab = tab; lab.publish(); }, onCycleBuildItem: () => undefined,
    onSetBuildItemIndex: (index) => { lab.storageIndex = index; lab.publish(); },
    placementFacingLabel: "North", placementClaimHint: null, onRotatePlacement: () => undefined, buildItemCount: items.length,
  };
  const rackHardware = {
    moveHardware: (rackId: string, from: { kind: "stock"; hardwareId: HardwareModelId } | { kind: "slot"; slot: number }, to: { kind: "stock" } | { kind: "slot"; slot?: number }) => {
      if (from.kind === "stock" && to.kind === "slot" && to.slot !== undefined) lab.installFromStock(rackId, from.hardwareId, to.slot);
    },
    onInstallCoolerToRack: () => undefined, onUninstallCoolerFromRack: () => undefined,
  };
  const tutorial = { ...createTabletPreviewTutorial(), tutorialCompleted: true, tutorialStage: "complete" as const, tutorialHint: null };
  return <TabletNavProvider value={nav}>
    <GameOverlay world={world} build={build} rackHardware={rackHardware} tutorial={tutorial} isTouch={isTouch} project={() => ({ x: 0, y: 0, visible: true })} />
  </TabletNavProvider>;
}

/** LLMville's screens; the world route draws the world's UI over the lab instead of loading the 3D session. */
function App({ isTouch }: { isTouch: boolean }) {
  const location = useScreenLocation();
  const gameId = matchScreenPath("/game/$gameId", location.pathname)?.["gameId"];
  if (gameId !== undefined && gameId !== "create") return <InWorld gameId={gameId} isTouch={isTouch} />;
  return <Screens />;
}

// --- driving it ------------------------------------------------------------------------------------

function mount(width: number, height: number, isTouch: boolean) {
  const container = new RuneNode("container");
  const root = new Root(nativeTreeHost(() => {}), container, "play");
  root.render(<AuthProvider><RuneViewport width={width} height={height}><App isTouch={isTouch} /></RuneViewport></AuthProvider>);
  const visible = () => {
    const surface = container.children[0];
    if (surface?.tag !== "rune-surface") throw new Error("LLMville did not mount its native surface");
    return visibleNativeNodes(surface);
  };
  const actions = () => visible().filter((node) => node.props.onPress !== undefined);
  const labels = () => actions().map(nativeLabel);
  const matches = (label: string, want: string | RegExp) => typeof want === "string" ? label === want : want.test(label);
  /** Lets lazy screens load, effects run and the stand-in backend's promises settle. */
  const settle = async () => {
    for (let round = 0; round < 12; round += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };
  const find = (want: string | RegExp): RuneNode => {
    const hit = actions().find((node) => matches(nativeLabel(node), want) && nativeEnabled(node));
    if (hit === undefined) throw new Error(`No enabled action ${String(want)} on screen. Visible: ${labels().join(" | ")}`);
    return hit;
  };
  const press = async (want: string | RegExp): Promise<string> => {
    const node = find(want);
    const label = nativeLabel(node);
    await act(() => node.props.onPress?.());
    await settle();
    return label;
  };
  const field = (label: string): RuneNode => {
    const node = visible().find((candidate) => candidate.tag === "rune-field" && candidate.props.label === label);
    if (node === undefined) throw new Error(`No field ${label} on screen. Visible: ${visible().map((n) => `${n.tag}:${nativeLabel(n).slice(0, 30)}`).join(" | ")}`);
    return node;
  };
  const type = async (label: string, text: string) => { await act(() => field(label).props.onEdit?.(text)); await settle(); };
  const submit = async (label: string) => { const node = field(label); await act(() => node.props.onSubmit?.(String(node.props.value ?? ""))); await settle(); };
  const sees = (text: string) => visible().some((node) => nativeLabel(node).includes(text) || node.text.includes(text));
  const run = async (fn: () => void) => { await act(fn); await settle(); };
  return { root, visible, actions, labels, find, press, type, submit, field, sees, settle, run };
}

const VIEWPORTS = [
  { name: "desktop 1280x720", width: 1280, height: 720, isTouch: false },
  { name: "phone 390x844", width: 390, height: 844, isTouch: true },
] as const;

describe("LLMville plays headless on the native surface", () => {
  for (const viewport of VIEWPORTS) {
    test(`sign in, build a lab, use every tablet app and go back to the menu (${viewport.name})`, async () => {
      lab = new Lab();
      memory.clear();
      const uninstall = screenRouter.install(memoryAddress("/"));
      const ui = mount(viewport.width, viewport.height, viewport.isTouch);
      try {
        await ui.settle();

        // Title screen, signed out: joining sends the player to sign in.
        await ui.press("Join world");
        expect(screenRouter.location().pathname).toBe("/login");
        await ui.type("Email", ACCOUNT.email);
        await ui.type("Password", "wrong-password");
        await ui.press("Sign In");
        expect(ui.sees("Invalid email or password")).toBe(true);
        expect(lab.session).toBeNull();
        await ui.type("Password", ACCOUNT.password);
        await ui.submit("Password");
        expect(lab.session?.user.email).toBe(ACCOUNT.email);

        // Signed in with no lab: the create route bootstraps one and enters the world.
        expect(lab.userWorld?._id).toBe("lab-ada");
        expect(screenRouter.location().pathname).toBe("/game/lab-ada");

        // The HUD: chat opens with its field focused, sends, and shows the line.
        await ui.press("Open chat");
        expect(ui.field("Message to neighbors").props.autoFocus).toBe(true);
        await ui.type("Message to neighbors", "anyone selling H100s?");
        await ui.submit("Message to neighbors");
        expect(lab.chat.at(-1)?.body).toBe("anyone selling H100s?");
        expect(ui.sees("anyone selling H100s?")).toBe(true);
        await ui.press("Close chat");

        // The tablet: a swipe handle on touch, the Tab key on a keyboard.
        const openTablet = async () => {
          if (viewport.isTouch) await ui.press("Open tablet");
          else await ui.run(() => keys?.toggleTablet());
          expect(keys?.tabletOpen).toBe(true);
        };
        const openApp = async (app: string) => {
          if (keys?.activeTabletApp !== null) await ui.press("Back to tablet home");
          await ui.press(`Open ${app}`);
        };
        await openTablet();

        // Store: buy a GPU.
        await openApp("Store");
        await ui.press("Hardware");
        const researched = await ui.press(/^Research — /);
        const tokensSpent = 5_000 - lab.dataTokens;
        expect(Object.keys(lab.researchUnlocks)).toHaveLength(1);
        expect(researched).toBe(`Research — ${tokensSpent.toLocaleString()} tokens ${getHardwareDefinition(Object.keys(lab.researchUnlocks)[0] as HardwareModelId).name}`);
        const moneyBeforeGpu = lab.money;
        const boughtGpu = await ui.press(/^Buy /);
        const gpuIds = Object.keys(lab.hardwareInventory);
        expect(gpuIds).toHaveLength(1);
        const gpu = gpuIds[0] as HardwareModelId;
        expect(boughtGpu).toBe(`Buy ${getHardwareDefinition(gpu).name}`);
        expect(lab.money).toBe(moneyBeforeGpu - getHardwareDefinition(gpu).buyPrice);

        // Store: buy a decoration for the build step.
        await ui.press("Decor");
        const decorResearch = await ui.press(/^Research — /);
        expect(Object.keys(lab.researchUnlocks)).toHaveLength(2);
        const boughtDecor = await ui.press(/^Buy /);
        const decor = BUILD_MENU_ITEMS.find((item) => `Buy ${item.label}` === boughtDecor);
        expect(decor).toBeDefined();
        expect(decorResearch.endsWith(decor?.label ?? "never")).toBe(true);
        expect(lab.buildInventory[decor?.id ?? ""]).toBe(1);

        // Models: license a base model.
        await openApp("Train models");
        const moneyBeforeModel = lab.money;
        const licensed = await ui.press(/^Unlock \$/);
        const unlocked = Object.keys(lab.modelCatalog);
        expect(unlocked).toHaveLength(1);
        const model = BASE_MODELS.find((entry) => entry.id === unlocked[0]);
        expect(licensed).toBe(`Unlock $${model?.licenseCost.toLocaleString()} ${model?.name}`);
        expect(lab.money).toBe(moneyBeforeModel - (model?.licenseCost ?? 0));

        // Hardware: E on the rack opens its menu; install the GPU from stock.
        await ui.run(() => keys?.openMenu({ type: "rack-config", rackId: "rack-1" }));
        await ui.press("Install GPU in slot 1");
        await ui.press(`Install ${getHardwareDefinition(gpu).name} in slot 1`);
        expect(lab.racks[0]?.installedHardwareModuleIds[0]).toBe(gpu);
        expect(lab.hardwareInventory[gpu]).toBe(0);
        await ui.press("Close rack hardware");

        // GPU jobs (inference): put the installed card on training.
        await openTablet();
        await openApp("GPU jobs");
        await ui.press(`Train models for ${getHardwareDefinition(gpu).name} · slot 1`);
        expect(lab.computeAssignments[assignmentKey("rack-1", 0)]?.lane).toBe("training");

        // Bills: pay the open invoice.
        await openApp("Bills");
        const moneyBeforeBill = lab.money;
        await ui.press(/^Pay \$1,200 for Grid power$/);
        expect(lab.bills).toHaveLength(0);
        expect(lab.money).toBe(moneyBeforeBill - 1_200);

        // Every other app opens.
        for (const app of ["Stats", "Map", "LLM Bot"]) {
          await openApp(app);
          expect(keys?.activeTabletApp).not.toBeNull();
        }

        // Storage: place the decoration, which closes the tablet into placement; confirm it in the world.
        await openApp("Storage");
        await ui.press(`Place ${decor?.label ?? ""}`);
        expect(keys?.tabletOpen).toBe(false);
        expect(lab.placing).toBe(decor?.id ?? null);
        await ui.press(/^Place( \(E or click\))?$/);
        expect(lab.placedBuildItems.map((item): string => item.itemId)).toEqual([decor?.id ?? ""]);

        // Close: the handle, then Back (Escape) on the open tablet.
        await openTablet();
        await ui.press("Close tablet");
        expect(keys?.tabletOpen).toBe(false);
        await openTablet();
        const back = ui.visible().find((node) => node.props.modal === true && node.props.onBack !== undefined);
        await ui.run(() => back?.props.onBack?.());
        expect(keys?.tabletOpen).toBe(false);

        // Pause to the main menu from the tablet's Settings.
        await openTablet();
        await openApp("Settings");
        await ui.press("Main Menu");
        expect(lab.exits).toBe(1);
        expect(screenRouter.location().pathname).toBe("/");

        // Menu settings: change a setting, rebind a key.
        await ui.press("Settings");
        const toggle = ui.find(/: (On|Off)$/);
        const before = nativeLabel(toggle);
        await ui.press(before);
        const after = before.endsWith("On") ? before.replace(/On$/, "Off") : before.replace(/Off$/, "On");
        expect(ui.labels()).toContain(after);
        await ui.press("Keybinds settings");
        await ui.press("Rebind Jump");
        const capture = ui.visible().find((node) => node.props.onKey !== undefined);
        await ui.run(() => capture?.props.onKey?.("KeyQ"));
        expect(getAppSettingsSnapshot().keybinds.jump.primary).toBe("KeyQ");
        await ui.press("Close settings");

        // The account page, then back into the same lab.
        await ui.run(() => void navigate({ to: "/dashboard" }));
        expect(ui.sees("ada@example.com")).toBe(true);
        await ui.press("Back home");
        await ui.press("Rejoin world");
        expect(screenRouter.location().pathname).toBe("/game/lab-ada");
        expect(ui.labels()).toContain("Open chat");
      } finally {
        ui.root.unmount();
        uninstall();
      }
    });
  }
});

