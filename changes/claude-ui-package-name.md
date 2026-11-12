The engine UI package is published as `@jgengine/ui` again. `@jgengine/react` is deprecated on npm with a message pointing here. Games and apps change `@jgengine/react` to `@jgengine/ui` in imports and `"react"` to `"ui"` in `jgengine.json`'s `engine` list; `jgengine sync` names the change if a project still lists `"react"`.

### Migrate

- Replace `@jgengine/react` with `@jgengine/ui` in imports, dependencies and Tailwind `@source` paths, and `"react"` with `"ui"` in `jgengine.json`'s `engine` list.
