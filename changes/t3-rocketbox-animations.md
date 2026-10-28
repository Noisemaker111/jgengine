Rocketbox's 471 animation clips are library entries (kind animation), tagged by body, motion and whether they travel; the editor's Asset library has an Animations tab

Closes #2714

### Added

- Rocketbox's 471 animation clips are library entries (kind animation), tagged by body, motion and whether they travel; the editor's Asset library has an Animations tab
- assets pull <clip key> writes a skeleton-only clip.glb that plays on any Rocketbox human, and assets pull <Rocketbox character> --clips <keys> bakes clips onto the character, retargeted by bone name and made in place
- `ROCKETBOX_CLIP_FOLDERS` (`@jgengine/assets/library/libraryRocketbox`): Rocketbox's three animation folders: in place (`static`), travelling on the ground (`xy`) and in 3D (`xyz`).
- `pullRocketboxClip` (`@jgengine/assets/rocketboxPull`): Pull one clip from Rocketbox's animation library and write `<outDir>/clip.glb`: the shared skeleton (no mesh) and one animation named `clip.name`, its tracks keyed by bone name in the same centimetre-under-a-0.01-root units a pulled avatar uses, so a mixer on any pulled Rocketbox human plays it unchanged. Also `PullRocketboxClipOptions`, `PulledRocketboxClip`.
