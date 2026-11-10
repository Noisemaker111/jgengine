import "./three-preload.ts";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Draw-component tests render React through react-dom, which needs a DOM. Registered only for
// `bun test` runs (each package's test script preloads this file); scripts keep the bare
// three-preload so `window`/`document` never leak into build or CLI code paths.
GlobalRegistrator.register();
