Brightway Park and Drift Foundry HUDs place themselves, so their cards stop covering each other on phone-sized screens.

### Changed

- Brightway Park and Drift Foundry draw their HUD as `HudCanvas` panels with one anchor and a priority each, instead of hand-placed CSS. At 800x450 Brightway's build sheet no longer covers the park card, and Drift Foundry's gate sign and compactor bar no longer run into the build rack and route strip. Their per-size position rules are gone.
