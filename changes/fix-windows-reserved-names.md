Root cause of the stray nul: scripts/bg-tasks.test.ts ran `ping ... >nul` through bash on Linux, which writes a file named nul at the repository root, and lane:close stages new files

### Changed

- Root cause of the stray nul: scripts/bg-tasks.test.ts ran `ping ... >nul` through bash on Linux, which writes a file named nul at the repository root, and lane:close stages new files
