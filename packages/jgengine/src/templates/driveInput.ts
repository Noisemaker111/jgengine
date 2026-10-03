/** @internal Parse a labelled text replacement without losing embedded equals signs. */
export function parseDriveFill(spec: string | undefined): { label: string; value: string } {
  const split = spec?.indexOf("=") ?? -1;
  if (spec === undefined || split <= 0 || spec.startsWith("--") || spec.slice(0, split).trim() === "") {
    throw new Error('--fill expects "<accessible label>=<value>"');
  }
  return { label: spec.slice(0, split), value: spec.slice(split + 1) };
}

/** @internal Browser target checks shared by portable and monorepo drives. */
export function driveInputPointExpr(text: string, input = false, focused = false): string {
  return `((needle, input, focused) => {
    if (!needle) return null;
    const selector = input ? 'input:not([type=hidden]), textarea' : 'button, [role=button], [role=switch], a';
    const nodes = Array.from(document.querySelectorAll(input ? selector : selector + ', span, div, h1, h2, h3'));
    const candidates = nodes.flatMap(node => {
      const labelled = (node.getAttribute('aria-labelledby') || '').split(/\\s+/)
        .map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      const accessible = labelled || node.getAttribute('aria-label') ||
        Array.from(node.labels || []).map(label => label.textContent || '').join(' ').trim();
      const names = input ? [accessible] : [(node.textContent || '').trim(), accessible];
      return names.map(name => name.toLowerCase()).filter(name => name && (input ? name === needle : name.includes(needle)))
        .map(name => ({ node: input ? node : node.closest(selector) || node, own: name }));
    });
    candidates.sort((a, b) => a.own.length - b.own.length || Number(b.node.matches(selector)) - Number(a.node.matches(selector)));
    if (!candidates.length) return null;
    const shortest = candidates[0].own.length, interactive = candidates[0].node.matches(selector);
    for (const item of candidates) {
      if (item.own.length !== shortest || item.node.matches(selector) !== interactive) break;
      const node = item.node;
      if (node.matches(':disabled') || node.closest('[aria-disabled="true"], [inert]')) continue;
      if (input && (node.readOnly || !node.matches('textarea, input:not([type]), input[type=text], input[type=search], input[type=email], input[type=url], input[type=tel], input[type=password], input[type=number]'))) continue;
      if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (focused) return document.activeElement === node;
      node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const rect = node.getBoundingClientRect();
      let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
      let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, clip.left + parent.clientLeft);
          right = Math.min(right, clip.left + parent.clientLeft + parent.clientWidth);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, clip.top + parent.clientTop);
          bottom = Math.min(bottom, clip.top + parent.clientTop + parent.clientHeight);
        }
      }
      if (right <= left || bottom <= top) continue;
      for (const fy of [0.5, 0.1, 0.9]) for (const fx of [0.5, 0.1, 0.9]) {
        const x = left + (right - left) * fx, y = top + (bottom - top) * fy;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === node || node.contains(hit))) return { x, y };
      }
    }
    return null;
  })(${JSON.stringify(text.toLowerCase())}, ${input}, ${focused})`;
}
