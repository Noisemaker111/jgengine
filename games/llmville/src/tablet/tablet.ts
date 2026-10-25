import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { exitPointerLock, requestPointerLock } from "@/movement/movementInput";
import { flushSync } from "react-dom";

import type { WorldViewModel } from "@/runtime/worldState";
import { readGameUiSession, writeGameUiSession } from "@/storage/storage";
import { TUTORIAL_STAGE } from "@llmville/game/tutorial/tutorialStages";
import type { TabletTutorialLock, TutorialViewModel } from "@/tutorial/tutorialRuntime";
import {
  TABLET_APP_ID,
  TABLET_STORE_TAB_ID,
  type TabletAppId,
  type TabletStoreTabId,
} from "@/tablet/tabletIds";

export type { TabletAppId, TabletStoreTabId };
export { TABLET_APP_ID, TABLET_STORE_TAB_ID };

export interface TabletAppShortcut {
  id: TabletAppId;
  label: string;
  color: string;
  icon: string;
}

export interface TutorialBenchOption {
  show: boolean;
  placed: boolean;
  onPlace: () => void;
}

export type GameMenuRequest =
  | { type: "tablet-home" }
  | { type: "tablet-app"; appId: TabletAppId; storeTab?: TabletStoreTabId }
  | { type: "rack-config"; rackId: string };

export type PersistedGameMenuState =
  | { type: "closed" }
  | { type: "tablet-home" }
  | { type: "tablet-app"; appId: TabletAppId; storeTab: TabletStoreTabId };

export const TABLET_APPS: readonly TabletAppShortcut[] = [
  { id: TABLET_APP_ID.models, label: "Train models", color: "bg-indigo-600", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { id: TABLET_APP_ID.inference, label: "GPU jobs", color: "bg-fuchsia-600", icon: "M4 13h6v7H4v-7zm10-9h6v16h-6V4zM4 4h6v5H4V4zm10 4h6v4h-6V8z" },
  { id: TABLET_APP_ID.stats, label: "Stats", color: "bg-cyan-600", icon: "M3 3v18h18M7 15l4-4 3 3 5-6" },
  { id: TABLET_APP_ID.store, label: "Store", color: "bg-emerald-600", icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" },
  { id: TABLET_APP_ID.storage, label: "Storage", color: "bg-amber-600", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { id: TABLET_APP_ID.map, label: "Map", color: "bg-teal-600", icon: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" },
  { id: TABLET_APP_ID.bills, label: "Bills", color: "bg-rose-600", icon: "M6 2h12v20l-3-2-3 2-3-2-3 2V2zm3 6h6M9 12h6" },
  { id: TABLET_APP_ID.bot, label: "LLM Bot", color: "bg-violet-600", icon: "M9 3v2m6-2v2M12 7a5 5 0 015 5v3a2 2 0 01-2 2H9a2 2 0 01-2-2v-3a5 5 0 015-5zM9.5 13h.01M14.5 13h.01M4 15h1m14 0h1" },
  { id: TABLET_APP_ID.settings, label: "Settings", color: "bg-zinc-600", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export const TABLET_STORE_TABS: readonly TabletStoreTabId[] = [
  TABLET_STORE_TAB_ID.infrastructure,
  TABLET_STORE_TAB_ID.decor,
  TABLET_STORE_TAB_ID.hardware,
  TABLET_STORE_TAB_ID.cooling,
  TABLET_STORE_TAB_ID.operator,
];
export const DEFAULT_TABLET_STORE_TAB: TabletStoreTabId = TABLET_STORE_TAB_ID.infrastructure;

export function getTabletActiveAppTitle(activeTab: TabletAppId): string {
  if (activeTab === TABLET_APP_ID.models) return "Train models";
  if (activeTab === TABLET_APP_ID.inference) return "GPU jobs";
  if (activeTab === TABLET_APP_ID.stats) return "Stats";
  if (activeTab === TABLET_APP_ID.store) return "Store";
  if (activeTab === TABLET_APP_ID.storage) return "Storage";
  if (activeTab === TABLET_APP_ID.bills) return "Bills";
  if (activeTab === TABLET_APP_ID.bot) return "LLM Bot";
  if (activeTab === TABLET_APP_ID.settings) return "Settings";
  return "Map";
}

/** Rack overlay is not restored across reloads; treat as closed for tablet bootstrap. */
/**
 * Desktop tablet can stay logically open while collapsed (pointer locked on the canvas).
 * Only the visible, interactable sheet should pause gameplay and count as "menu open".
 */
export function isTabletUiBlockingGameplay(
  tabletOpen: boolean,
  isPointerLocked: boolean,
  isTouch: boolean,
): boolean {
  return tabletOpen && (isTouch || !isPointerLocked);
}

export interface TabletNavState {
  tabletOpen: boolean;
  activeTabletApp: TabletAppId | null;
  activeStoreTab: TabletStoreTabId;
  rackMenuOverlayRackId: string | null;
  cancelPointerLockRetry: () => void;
  requestGameFocus: () => void;
  openTabletHome: () => void;
  openTabletApp: (appId: TabletAppId, storeTab?: TabletStoreTabId) => void;
  openTabletStoreTab: (tab: TabletStoreTabId) => void;
  openMenu: (menuRequest: GameMenuRequest) => void;
  closeMenu: () => void;
  toggleTablet: (nextOpen?: boolean) => void;
}

export interface TabletNavBundle {
  nav: TabletNavState;
  containerRef: RefObject<HTMLDivElement | null>;
}

interface UseTabletNavParams {
  gameId: string;
}

export function useTabletNav({ gameId }: UseTabletNavParams): TabletNavBundle {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerLockRetryFrameRef = useRef<number | null>(null);
  const [restoredMenu] = useState(() => readGameUiSession(gameId));
  const [hydratedGameId, setHydratedGameId] = useState(gameId);
  const [tabletOpen, setTabletOpen] = useState(
    () => restoredMenu.type === "tablet-home" || restoredMenu.type === "tablet-app",
  );
  const [activeTabletApp, setActiveTabletApp] = useState<TabletAppId | null>(
    () => restoredMenu.type === "tablet-app" ? restoredMenu.appId : null,
  );
  const [activeStoreTab, setActiveStoreTab] = useState<TabletStoreTabId>(
    () => restoredMenu.type === "tablet-app" && restoredMenu.appId === TABLET_APP_ID.store ? restoredMenu.storeTab : DEFAULT_TABLET_STORE_TAB,
  );
  const [rackMenuOverlayRackId, setRackMenuOverlayRackId] = useState<string | null>(null);

  const cancelPointerLockRetry = useCallback(() => {
    if (pointerLockRetryFrameRef.current === null) return;
    cancelAnimationFrame(pointerLockRetryFrameRef.current);
    pointerLockRetryFrameRef.current = null;
  }, []);

  const requestGameFocus = useCallback(() => {
    const canvas = containerRef.current?.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) return;

    cancelPointerLockRetry();
    if (document.activeElement instanceof HTMLElement && document.activeElement !== canvas) {
      document.activeElement.blur();
    }
    canvas.focus({ preventScroll: true });

    let attemptsRemaining = 12;
    const retryPointerLock = () => {
      pointerLockRetryFrameRef.current = null;
      if (document.pointerLockElement === canvas) return;
      canvas.focus({ preventScroll: true });
      requestPointerLock(canvas);
      attemptsRemaining -= 1;
      if (attemptsRemaining <= 0) return;
      pointerLockRetryFrameRef.current = requestAnimationFrame(retryPointerLock);
    };

    retryPointerLock();
  }, [cancelPointerLockRetry]);

  const openTabletHome = useCallback(() => {
    cancelPointerLockRetry();
    setTabletOpen(true);
    setActiveTabletApp(null);
    setRackMenuOverlayRackId(null);
    exitPointerLock();
  }, [cancelPointerLockRetry]);

  const openTabletApp = useCallback((appId: TabletAppId, storeTab?: TabletStoreTabId) => {
    cancelPointerLockRetry();
    setTabletOpen(true);
    setActiveTabletApp(appId);
    if (appId === TABLET_APP_ID.store && storeTab !== undefined) {
      setActiveStoreTab(storeTab);
    }
    setRackMenuOverlayRackId(null);
    exitPointerLock();
  }, [cancelPointerLockRetry]);

  const closeMenu = useCallback(() => {
    flushSync(() => {
      setTabletOpen(false);
      setActiveTabletApp(null);
      setRackMenuOverlayRackId(null);
    });
    requestGameFocus();
  }, [requestGameFocus]);

  const openMenu = useCallback((menuRequest: GameMenuRequest) => {
    if (menuRequest.type === "rack-config") {
      cancelPointerLockRetry();
      setTabletOpen(false);
      setActiveTabletApp(null);
      setRackMenuOverlayRackId(menuRequest.rackId);
      exitPointerLock();
      return;
    }

    if (menuRequest.type === "tablet-app") {
      openTabletApp(menuRequest.appId, menuRequest.storeTab);
      return;
    }

    openTabletHome();
  }, [cancelPointerLockRetry, openTabletApp, openTabletHome]);

  const toggleTablet = useCallback((nextOpen?: boolean) => {
    const menuOpen = rackMenuOverlayRackId !== null || tabletOpen;
    const shouldOpen = nextOpen ?? !menuOpen;
    if (shouldOpen) {
      openTabletHome();
      return;
    }
    closeMenu();
  }, [closeMenu, openTabletHome, rackMenuOverlayRackId, tabletOpen]);

  useEffect(() => {
    cancelPointerLockRetry();
    const nextMenu = readGameUiSession(gameId);
    setTabletOpen(nextMenu.type === "tablet-home" || nextMenu.type === "tablet-app");
    setActiveTabletApp(nextMenu.type === "tablet-app" ? nextMenu.appId : null);
    setActiveStoreTab(nextMenu.type === "tablet-app" && nextMenu.appId === TABLET_APP_ID.store ? nextMenu.storeTab : DEFAULT_TABLET_STORE_TAB);
    setRackMenuOverlayRackId(null);
    setHydratedGameId(gameId);
  }, [cancelPointerLockRetry, gameId]);

  useEffect(() => {
    if (hydratedGameId !== gameId) return;
    const menuState: PersistedGameMenuState = tabletOpen
      ? activeTabletApp === null
        ? { type: "tablet-home" }
        : {
          type: "tablet-app",
          appId: activeTabletApp,
          storeTab: activeTabletApp === TABLET_APP_ID.store ? activeStoreTab : DEFAULT_TABLET_STORE_TAB,
        }
      : { type: "closed" };

    writeGameUiSession(gameId, menuState);
  }, [activeStoreTab, activeTabletApp, gameId, hydratedGameId, tabletOpen]);

  useEffect(() => {
    return () => {
      cancelPointerLockRetry();
    };
  }, [cancelPointerLockRetry]);

  const nav = useMemo(
    (): TabletNavState => ({
      tabletOpen,
      activeTabletApp,
      activeStoreTab,
      rackMenuOverlayRackId,
      cancelPointerLockRetry,
      requestGameFocus,
      openTabletHome,
      openTabletApp,
      openTabletStoreTab: setActiveStoreTab,
      openMenu,
      closeMenu,
      toggleTablet,
    }),
    [
      activeStoreTab,
      activeTabletApp,
      cancelPointerLockRetry,
      closeMenu,
      openMenu,
      openTabletApp,
      openTabletHome,
      rackMenuOverlayRackId,
      requestGameFocus,
      tabletOpen,
      toggleTablet,
    ],
  );

  return { nav, containerRef };
}

export type GameTabletNavSlice = Pick<
  TabletNavState,
  | "tabletOpen"
  | "activeTabletApp"
  | "activeStoreTab"
  | "rackMenuOverlayRackId"
  | "openTabletHome"
  | "openTabletApp"
  | "openTabletStoreTab"
  | "toggleTablet"
>;

interface UseGameTabletFrameParams {
  world: Pick<WorldViewModel, "isPointerLocked" | "isTraining" | "activeTraining" | "gameTime" | "spendPulse">;
  tutorial: Pick<
    TutorialViewModel,
    | "tabletTutorialLock"
    | "tutorialStage"
    | "tutorialStarted"
    | "tutorialCompleted"
    | "tutorialBenchPlaced"
    | "onPlaceTutorialBench"
    | "onTabletAppOpened"
    | "onTabletStoreTabOpened"
  >;
  nav: GameTabletNavSlice;
  isTouch: boolean;
}

export function useGameTabletFrame({ world, tutorial, nav, isTouch }: UseGameTabletFrameParams) {
  const {
    tabletOpen,
    activeTabletApp,
    activeStoreTab: navActiveStoreTab,
    rackMenuOverlayRackId,
    openTabletHome,
    openTabletApp,
    openTabletStoreTab,
    toggleTablet,
  } = nav;

  const collapsed =
    !tabletOpen
    || (!isTouch && world.isPointerLocked)
    || rackMenuOverlayRackId !== null;
  const lock: TabletTutorialLock | null =
    tutorial.tabletTutorialLock?.enabled === true ? tutorial.tabletTutorialLock : null;
  const tutorialBench: TutorialBenchOption | undefined =
    tutorial.tutorialStage === TUTORIAL_STAGE.placeRack && tutorial.tutorialStarted && !tutorial.tutorialCompleted
      ? {
        show: true,
        placed: tutorial.tutorialBenchPlaced,
        onPlace: tutorial.onPlaceTutorialBench,
      }
      : undefined;

  const isAppAllowed = useCallback((appId: TabletAppId): boolean => {
    if (appId === TABLET_APP_ID.settings) return true;
    if (lock === null) return true;
    return lock.allowedApps.includes(appId);
  }, [lock]);

  const isStoreTabAllowed = useCallback((storeTabId: TabletStoreTabId): boolean => {
    if (lock === null) return true;
    return lock.allowedStoreTabs.includes(storeTabId);
  }, [lock]);

  const activeTab =
    activeTabletApp !== null && isAppAllowed(activeTabletApp) ? activeTabletApp : null;

  const activeStoreTab = useMemo(() => {
    if (activeTab !== TABLET_APP_ID.store) return navActiveStoreTab;
    if (isStoreTabAllowed(navActiveStoreTab)) return navActiveStoreTab;
    const fallbackTab = lock?.allowedStoreTabs[0];
    return fallbackTab ?? DEFAULT_TABLET_STORE_TAB;
  }, [activeTab, isStoreTabAllowed, lock, navActiveStoreTab]);

  // Keep nav + persisted menu aligned when tutorial lock tightens while a disallowed app/tab is open.
  useEffect(() => {
    if (activeTabletApp !== null && activeTab === null) {
      openTabletHome();
      return;
    }
    if (activeTab === TABLET_APP_ID.store && activeStoreTab !== navActiveStoreTab) {
      openTabletStoreTab(activeStoreTab);
    }
  }, [
    activeStoreTab,
    activeTab,
    activeTabletApp,
    navActiveStoreTab,
    openTabletHome,
    openTabletStoreTab,
  ]);

  const openTab = useCallback(
    (tab: TabletAppId) => {
      if (!isAppAllowed(tab)) return;
      openTabletApp(tab);
      tutorial.onTabletAppOpened(tab);
    },
    [isAppAllowed, openTabletApp, tutorial],
  );

  const openStoreTab = useCallback(
    (storeTabId: TabletStoreTabId) => {
      if (!isStoreTabAllowed(storeTabId)) return;
      openTabletStoreTab(storeTabId);
      tutorial.onTabletStoreTabOpened(storeTabId);
    },
    [isStoreTabAllowed, openTabletStoreTab, tutorial],
  );

  const isModelsTheme = activeTab === TABLET_APP_ID.models || activeTab === TABLET_APP_ID.inference;
  const headerTitle = activeTab !== null ? getTabletActiveAppTitle(activeTab) : "";

  return {
    activeTab,
    activeStoreTab,
    collapsed,
    lock,
    tutorialBench,
    isAppAllowed,
    isStoreTabAllowed,
    openTab,
    openStoreTab,
    isModelsTheme,
    headerTitle,
    openTabletHome,
    toggleTablet,
  };
}

export function useEscapeToClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabled || event.defaultPrevented || event.key !== "Escape" || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, enabled]);
}
