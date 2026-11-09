WebGPU programs keep camera and light uniforms in a persistent buffer, uploading only the spans that changed each frame

### Added

- WebGPU programs keep camera and light uniforms in a persistent buffer, uploading only the spans that changed each frame
- `WgslUniformBlock` (`@jgengine/core/webgpu/glslToWgsl.draw`): Where one of three's uniform names lives: `shared` is the program-wide block (binding 0, persistent across frames), `object` the per-object block (binding 1, restaged per draw batch).

### Fixed

- the WebGPU pass recorder and vertex attribute copies stopped allocating per frame
