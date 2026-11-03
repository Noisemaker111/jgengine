background tasks on Windows outlive whatever ends their caller's process tree, so lane:close's landing queue no longer dies at random with an empty log; commands with double quotes (bun -e "...") also reach cmd.exe intact

Root cause: on Windows a detached child stays in its caller's process tree, so when the `bun run` that started the land-queue runner exited, the runner sometimes went with it (2 in 6 here; both runners in the asset-packs lane on 2026-11-03). The supervisor is now created by WMI, outside the caller's tree and job, and reads the command and the caller's environment from its task folder.

### Fixed

- background tasks on Windows outlive whatever ends their caller's process tree, so lane:close's landing queue no longer dies at random with an empty log; commands with double quotes (bun -e "...") also reach cmd.exe intact
