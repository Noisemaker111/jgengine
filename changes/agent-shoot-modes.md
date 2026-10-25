### Added

- Fire commands get `held` (`{ yaw, pitch, aim, held }`): `false` on the click, `true` on `repeatMs` re-fires, so one binding drives a single-shot pistol and an automatic rifle. `ItemUseInput.held` carries it into item-use handlers.
- `combat.recoil` event (`{ from, pitch, yaw?, recover? }`): the local player's view climbs by the kick in about 65 ms and settles back (default about 85% within 0.3 s), capped at 0.35 rad per burst, in views that aim with the look. `input/recoil` devtools probe.

### Fixed

- A cursor (ray) aim now strays inside the gun's catalog spread like a look aim; it was always laser-straight. A ray aim passes `spread: 0` for a precise shot. `Aim.spread` is allowed on ray aims.
