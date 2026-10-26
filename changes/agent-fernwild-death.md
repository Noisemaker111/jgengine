Death in Fernwild now works as in ARK. When a survivor dies, everything they carried (bag and hotbar) stays with their body where they fell. They wake at the beach spawn with empty hands and full vitals, keeping their level and engrams. A pale beam of light rises over the body so it can be found from afar, and the HUD's top right shows how far away it is and how long it lasts. Walk back and press E to take everything back (whatever doesn't fit stays with the body). After an hour the body falls apart and what it held is lost. Bodies are kept in the save.

This also fixes two bugs that meant a survivor could never die. A raptor's killing blow made the engine delete the player outright, because the survivor wasn't marked as handling its own death. And a hit that left health at exactly zero was healed back up before the death check ran.

Two admin cheats were added for proofs: `kill`, and `destroyWild` (ARK's DestroyWildDinos). A new flow, fernwild-death, gives the survivor gear, lets a level 30 raptor kill them on a hillside, checks they wake on the beach with nothing, clears the wild, returns to the body and takes all three stacks back, with a shot at each stage.

In the engine, the orbit camera now cuts straight to a target that jumps more than `snapDistance` (default 30 m), such as a teleport or a respawn, instead of gliding across the whole map.

Engine seam: packages/core/src/remains/ (new: remains left on death, taken back stack by stack, expiring, saved), packages/core/src/camera/orbitCameraMath.ts (snapDistance)

Prevention: remains tests (merge, nearest, partial take keeps the rest, expiry, save round trip). Fernwild's death tests cover a raptor killing a survivor far from the beach, everything carried ending up on the body, recovery at the body and not from afar, the hour's decay, and the save. The orbit follow tests check that an ordinary step glides while a teleport cuts with the offset kept.

### Added

- `createRemainsField({ lastsSeconds })` in `@jgengine/core/remains/remains`: leave what someone carried where they fell, find the nearest, take back what fits, lose it when it expires, snapshot and restore.
- Orbit camera `snapDistance`: a follow target that jumps farther than this is cut to rather than glided to (default 30).
