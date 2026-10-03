### Added

- Named, versioned player scene saves through injected `CreatorDocumentStorage`, with optimistic revisions, schema validation, catalog permissions and explicit work budgets.
- Production `GameHost` creator configuration controlled by game-owned menus, with shared Create/Edit/Save/Reopen and fresh isolated document-snapshot playtests.

### Fixed

- Rejected creator edits leave document history and live-sync publication unchanged; durable save failures remain visible and approved catalog placements avoid persisting raw asset URLs.
- Edit mode preserves the game's authored models and placement overlay alongside editor guides; save acknowledgements, dirty state and pending failures survive Play/Return.
- Live authored prop moves/removals update previews while unrelated edits preserve game-initialized prop state.
- Creator budgets include bounded collision child pools; play clock control preserves native canvas rendering without postprocessing.
