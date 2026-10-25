### Changed

- One command each for capturing, driving and landing. `bun run shoot --prove <game> ...` replaces `bun run games:prove`. `bun run lane:close --batch <branch ...>` replaces `bun run land:batch`, and `bun run lane:close --queue` replaces `bun run land:queue`. The bare `bun run land` script is gone, since `lane:close` runs it.
- Removed the one-off `scripts/drive-settings.ts`, `scripts/drive-presentation-recovery.ts` and `scripts/drive-hud-lean-entry.ts` proof drivers. `bun run drive` is the only drive command.
