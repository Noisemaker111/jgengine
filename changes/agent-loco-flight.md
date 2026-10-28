flightPower scores a game flier against Pennycuick's flight model: minimum-power and maximum-range speeds, wingbeat and whether it could keep flapping

Closes #2795

### Added

- `flightPower`, `minimumPowerSpeed`, `maximumRangeSpeed`, `cruisingWingbeatFrequency`, `universalWingbeatFrequency` and `compareFlier` give a bird, pterosaur or insect's flight power and speeds from its mass, span and wing area (Pennycuick 2008 and 2013).
- `validateFlightReference` checks the model against ornithodolite airspeeds of 31 migrating species, seabird and albatross wingbeats and 19 insects.
- `bun run games:capabilities locomotion --creatures ... --fliers <id,...>` scores a game's fliers against Argentavis, Pteranodon or Quetzalcoatlus.
