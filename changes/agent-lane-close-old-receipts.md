lane:close tells a lane too old to write a receipt beta's landing code reads to merge beta, before running anything

### Fixed

- `bun run lane:close` on a lane branched before beta's current verify:fast receipts stops in seconds with "Merge beta into this branch (git merge origin/beta) and close again". Before, it ran the whole verify:fast (40 minutes on 2026-11-08), then refused to merge with a misleading "the files changed while verify:fast ran"
- A lane that changes `scripts/verify-receipt.ts`, which lane:close reads receipts with, now lands with its own landing code, like one that changes lane-close or land
