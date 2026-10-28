Fernwild shows ARK's item lines at the top of the screen: an icon and "ADDED: 3x Thatch" for every item gained, "CONSUMED: 1x Cooked Meat" for food eaten, stacking and fading; the grey +3 Thatch text on the trunk and the left-edge gain line are gone

Refs #2687

Engine seam: packages/core/src/feed/killFeed.view.tsx

### Added

- KillFeed takes renderIcon for a game's own item art, rowStyle for bare lines and oldestFirst so new lines land at the bottom
- fernwild-pickup flow punches the spawn tree and picks up stones in first person

### Changed

- Fernwild shows ARK's item lines at the top of the screen: an icon and "ADDED: 3x Thatch" for every item gained, "CONSUMED: 1x Cooked Meat" for food eaten, stacking and fading; the grey +3 Thatch text on the trunk and the left-edge gain line are gone
- Fernwild's load baseline is re-recorded at 13.7 s scene ready: clean beta already measured 14-16 s against the old 9.7 s, so every Fernwild landing failed the guard (#2758)
