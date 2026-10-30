loot's own weighted picker and the building lots' copy; both use the table part, random/pick pickWeighted

Refs #2817

### Fixed

- pickWeighted gives a roll exactly on a boundary to the later item and never returns a zero-weight item, so it matches what loot tables always did

### Removed

- loot's own weighted picker and the building lots' copy; both use the table part, random/pick pickWeighted
