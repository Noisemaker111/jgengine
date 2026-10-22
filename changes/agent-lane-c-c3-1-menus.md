### Added

- `createMenuTransition` (`@jgengine/core/ui/menuTransition`): closed → enter → open → exit → closed timing over an injected clock, with reduced-motion collapse to zero and `snapshot`/`restore`.
- `@jgengine/core/ui/menuNav`: `menuNavMove` focus movement over a vertical list, horizontal row or grid with disabled-item skipping, `menuIntentForKey`, `menuIntentForPadButton`, `menuIntentForPadAxis` and `shouldRepeatMenuNav` for held d-pad/stick repeat.
- `MenuScreen` (`@jgengine/react/menuScreen`): animated enter/exit screen with a translucent scrim, a `backdrop` slot for a live 3D scene, reduced-motion collapse and exit unmount. Animates transform/opacity only.
- `TitleMenu` (`@jgengine/react/titleMenu`): title-screen block — wordmark, eyebrow, tagline, navigable verb list, footer, control hint and backdrop slot. Games own the wording, verbs and art.
- `useMenuNav` (`@jgengine/react/menuNav`): keyboard and standard-gamepad focus navigation for any menu — roving `tabIndex`, arrow/WASD/Home/End moves, Enter/Space/A confirm, Escape/Backspace/B/Start back, held-stick repeat, disabled-item skipping, no focus trap (Tab stays native, typing is never intercepted) and keys that work when focus starts outside the menu.
- `PauseMenu` now navigates with the same keyboard/gamepad rules; Resume is the first item and Escape resumes.
- Engine demo `menu-framework` (`bun run shoot menu-framework --mode play`) renders a live 3D scene behind the title and pause screens.
