the post chain draws three fewer full-screen copies (exposure meter, GTAO blend, atmosphere apply), one draw for the beauty copy, AO and contact shadows, and bloom without its twelve clears, with every frame bit-identical (perf post-audit: 0 differing texels in all 9 games); GPU post time dropped in every game measured

Refs #3016, #3017

### Added

- bun run perf post-audit redraws each changed post draw three's way on live frames and counts differing texels; bun run check postfx-exact checks the half-float rounding on the GPU
- `PostAuditStats` (`@jgengine/core/postfx/postAudit.draw`): What the changed draws did and, with the audit on, what comparing them with three's draws found.

### Fixed

- the post chain draws three fewer full-screen copies (exposure meter, GTAO blend, atmosphere apply), one draw for the beauty copy, AO and contact shadows, and bloom without its twelve clears, with every frame bit-identical (perf post-audit: 0 differing texels in all 9 games); GPU post time dropped in every game measured
- perf fps-gap and the perf audits take the perf lock before starting a game's dev server and browser
- the core API-surface test's budget fits a whole-package type walk on a loaded machine
