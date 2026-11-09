WebGPU: correct boot and shadows, cheaper passes, MSAA resolved in its own pass, perf tooling (part of #3066)

Root cause: the async WebGPU renderer factory let R3F configure run twice from stale state, leaving a camera at aspect 0 (NaN projection) that also stalled the shadow cache

### Added

- `prepareEngineRenderer` (`@jgengine/core/webgpu/engineRenderer.draw`): Do the asynchronous part of starting `backend` (on WebGPU: the shader translator and one device) and return the synchronous factory for one canvas. Also `EngineRendererFactory`, `useEngineRendererFactory`.
- `requestWebGpuDevice` (`@jgengine/core/webgpu/webgpuGl.draw`): Request the WebGPU device, or `null` when this browser has no usable WebGPU adapter. Also `WebGpuDevice`.

### Changed

- WebGPU: correct boot and shadows, cheaper passes, MSAA resolved in its own pass, perf tooling (part of #3066)

### Removed

- `@jgengine/core/webgpu/engineRenderer.draw` no longer exports `engineRendererFactory`.
