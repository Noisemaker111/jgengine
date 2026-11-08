Landing always runs beta's current landing code: lane:close fetches beta, unpacks its scripts/ once per version into .git/jg-landing/, and runs lane-close, land, the queue and the batch from there against the lane, so a landing fix reaches lanes made before it

Root cause: lane:close and the queue ran scripts/ from the lane's own worktree, so lanes branched before #3044 kept hitting the PLAN/README score-block clash it fixed

### Changed

- Landing always runs beta's current landing code: lane:close fetches beta, unpacks its scripts/ once per version into .git/jg-landing/, and runs lane-close, land, the queue and the batch from there against the lane, so a landing fix reaches lanes made before it
