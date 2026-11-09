lane:close merges its own PR once its verify:fast receipt covers the pushed head; no landing queue and no PR CI

### Changed

- lane:close merges its own PR once its verify:fast receipt covers the pushed head; no landing queue and no PR CI
- A passing verify:fast --landing of the same tree is reused: lane:close skips preflight and verify in one line
