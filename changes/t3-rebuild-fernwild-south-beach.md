Fernwild's south beach as ARK draws it: pale sand with pebbles and driftwood, palms and cycads by the water, a jungle wall of tall trees, tree ferns, bushes and waist-high grass a few metres inland; the survivor wakes on it beside a palm

Closes #2687

Root cause: survey kinds had no scene renderer, so AuthoredPaths drew them as road ribbons; auto-exposure metered a dark night back up by up to 2.5x

### Added

- Fernwild's south beach as ARK draws it: pale sand with pebbles and driftwood, palms and cycads by the water, a jungle wall of tall trees, tree ferns, bushes and waist-high grass a few metres inland; the survivor wakes on it beside a palm
- nature bushes grow real leaves in two-sided clusters, and palm trunks draw with the bark material
- grass fields take growAbove, the lowest ground they grow on, so a field behind a beach leaves the sand bare

### Fixed

- survey outlines (coast, ridge, river, biome) no longer draw as brown road strips across the ground and the shallows
- auto-exposure no longer lifts a night back up to dusk; it lifts only by the sky's share of daylight
- grass blades masked to nothing no longer leave flat slivers on bare ground
