### Migrate

- Settings, dialogs and inventory views each live in one folder per layer. Update deep imports:
  - `@jgengine/react/{settings,settingsBlocks,accessibilitySettings,keybindingMenu}` → `@jgengine/react/settings/…`.
  - `@jgengine/react/{modals,dialogBehavior}` → `@jgengine/react/dialog/…`; `@jgengine/core/ui/modalStack` → `@jgengine/core/dialog/modalStack`.
  - `@jgengine/react/{inventoryGrid,slots,shopGrid}` → `@jgengine/react/inventory/…`.
