### Fixed

- `check-game-front-end` counts `CreditsPane` as a game's credits surface. 0.38.4's games pin reported `Games/deepward - no credits` for a game that renders the credits in the `GameMenu` the engine ships (`CreditsPane` in a detail slot), because the pattern only knew `CreditsScreen`, `CreditsPanel` and the generated asset credits. Harbor Heat's baselined `#credits` entry no longer applies at the current pin, so the baseline shrinks from 8 entries to 7; Brightway Park's stays until the games pin that ships its menu.

### Fixed (CI)

- The ci aggregate job accepts a smoke run that actually ran and passed when the path map says no game surface changed. A script under scripts/** is in the heavy set but not in the game map, so GAMES=none with SMOKE=success is a real combination; the job asserted on skipped and failed an otherwise green run, which is what blocked this PR.
