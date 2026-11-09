Verified: depth-run passed 135 steps in the browser dev build and in the WebView2 desktop build; the model cannot view images, so screens were checked through probe data and shot.json pixel signatures.

Closes #3097

Root cause: the play surface's height came only from Tailwind utilities a game's stylesheet scan can miss; with none emitted the surface measured zero height, React Three Fiber never configured the canvas and the SceneWarmupGate inside it never mounted, so the warmup cover waited forever. The surface now sizes itself inline, Deepward's and LLMVille's @source paths name the package sources games resolve, and tests fail if a declared source stops existing or the inline sizing is removed.

Engine seam: packages/shell/src/Shell3dPresentation.tsx

### Changed

- Verified: depth-run passed 135 steps in the browser dev build and in the WebView2 desktop build; the model cannot view images, so screens were checked through probe data and shot.json pixel signatures.
