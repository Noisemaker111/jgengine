Every game and new game draws its UI on Rune; the shell's join, view-error, lost-display and rotate screens draw on Rune

Engine seam: packages/core/src/game/gameFlow.ts, packages/core/src/hud/ShellHudPresentation.draw.tsx, packages/core/src/menu/gameFlowMenus.view.tsx, packages/core/src/multiplayer/JoinGate.view.tsx, packages/core/src/onboarding/onboarding.view.tsx, packages/core/src/session/useServerSession.view.ts, packages/core/src/settings/QuickControls.draw.tsx, packages/core/src/settings/SettingsChrome.draw.tsx and 20 more

### Migrate

- uiRenderer is gone (Rune is the only game UI path); GameFlowUI, SettingsChrome, SettingsMenu, QuickControls, onboarding.view and useServerSession.view are removed
- the JSX runtime drops PureComponent, cloneElement, createRef, forwardRef, startTransition, useDebugValue and useTransition
- a game page's root fills the window from index.html (style=position:fixed;inset:0); the shell's play surface stays in flow

### Added

- `shellScreenTheme` (`@jgengine/core/ui/rune/shellScreens.view`): The engine's own screens — joining a world, a view that failed, a lost display, turning the device — drawn on Rune like every game screen.

### Changed

- Every game and new game draws its UI on Rune; the shell's join, view-error, lost-display and rotate screens draw on Rune

### Removed

- `@jgengine/core/menu/gameFlowMenus.view` no longer exports `GameFlowMenuContent`, `GameFlowUI`, `GameFlowUIProps`, `startNewGame`.
- `@jgengine/core/onboarding/onboarding.view` no longer exports `OnboardingBanner`, `OnboardingHud`, `OnboardingHudProps`, `useOnboarding`.
- `@jgengine/core/session/useServerSession.view` no longer exports `useServerSession`.
- `@jgengine/core/settings/QuickControls.draw` no longer exports `QuickControls`.
- `@jgengine/core/settings/SettingsChrome.draw` no longer exports `SettingsChrome`.
- `@jgengine/core/settings/SettingsMenu.draw` no longer exports `SettingsMenu`.
- `@jgengine/core/ui/jsx` no longer exports `PureComponent`, `cloneElement`, `createRef`, `forwardRef`, `startTransition`, `useDebugValue`, `useTransition`.
- `@jgengine/core/ui/jsx/element` no longer exports `cloneElement`, `createRef`, `forwardRef`.
- `@jgengine/core/ui/jsx/reconciler` no longer exports `PureComponent`, `startTransition`, `useDebugValue`, `useTransition`.
