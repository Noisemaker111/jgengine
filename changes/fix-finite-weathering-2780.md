Keep weathering finite under deep cover

Root cause: Exponentiation overflowed under deep cover, and river deposition omitted the concentration of grains near the bed.

Closes #2780

### Fixed

- Keep weathering finite under deep cover
- Sort river sediment using its concentration near the bed
- Include hillslope creep in outlet volume
- Attribute test failures to the right file
