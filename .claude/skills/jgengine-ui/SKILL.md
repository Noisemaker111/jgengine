---
name: jgengine-ui
description: Game presentation and interface direction for HUDs, menus, touch controls, motion, feedback, accessibility, and visual verification.
---

# jgengine-ui

Use this skill for the **visual and interaction design of the game interface**: title screens, HUDs, menus, prompts, maps, inventories, dialogue, touch controls, transitions, pause/results states, accessibility, and screenshot critique.

Do not use this skill as a React, routing, state-management, or hooks reference. The main `jgengine` skill owns routing and points to the engine APIs. When implementation needs `@jgengine/react` hooks or shell APIs, follow the links in the main skill and the compact API appendix in [reference.md](reference.md); keep this skill focused on what the player sees and feels.

## Required outcome

A JGengine game must read as a self-contained game, not a responsive website with a canvas inside it.

Before shipping UI:

1. Give the game a concise UI art direction.
2. Compose explicit desktop/mobile game layouts instead of document flow.
3. Keep persistent HUD information sparse and hierarchical.
4. Adapt touch controls to the genre and reserve their screen zones.
5. Implement authored focus, pressed, selected, disabled, success, failure, and warning states.
6. Add purposeful motion and feedback.
7. Capture screenshots and revise what actually renders.

The full quality bar, forbidden patterns, layout rules, and verification checklist are in **[reference.md](reference.md)** and are mandatory.

## Separation of responsibilities

- `jgengine`: intake, project shape, engine APIs, hooks, input commands, shell integration, and routing to this skill.
- `jgengine-ui`: art direction, composition, visual hierarchy, interaction presentation, responsive game layouts, touch-control treatment, and visual acceptance criteria.
- `jgengine-verify`: final proof, screenshots, and runtime checks after implementation.

Do not create additional UI skills to solve ordinary presentation work. Improve the game UI and this skill instead.
