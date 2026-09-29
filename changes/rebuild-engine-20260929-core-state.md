### Migrate

- Use `RegenShield.refill(amount)` for pickups and scripted point gains. Numeric `restore(amount)` remains a deprecated compatibility alias; `restore(state)` loads saved shield state.

### Added

- Core ability kits, item-instance registries, event meters, accumulator meters, and regen shields expose detached `state()` and `restore(state)` contracts for saves and deterministic continuation. Ability HUD views remain compatible; saves preserve retuning, independent cooldowns, allocation sequence, meter latches, and shield grace timing.
- `EventMeter.tick(dt, decayEnabled)` lets caller-owned visibility policy pause decay and its delay; existing one-argument ticks behave as before.
