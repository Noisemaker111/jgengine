### Fixed

- The dev runner starts again. Its vite config imported the shared `devSavePlugin` from `@jgengine/node` source, which imports `@jgengine/core` by package name, and a config file cannot resolve that; the running server now loads the plugin, so its own aliases resolve core to source.
