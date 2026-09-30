### Added

- `disposeModelScene` (`@jgengine/shell/render/modelRender`) releases a `cloneModelScene` instance's materials and bone textures while preserving loader assets and separately owned attachments.

### Fixed

- Model instances retain skeleton and material sharing within each rig, reducing duplicate bone textures and skeleton updates without sharing poses between characters. Entity models, attachments and scatter release their owned resources.
- Model animation releases mixer bindings on replacement/unmount and skips paused or completed clip updates. Configuration changes refresh demand-rendered poses.
- Sprite atlas frames change UVs without repeatedly uploading the image.
