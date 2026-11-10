/**
 * `:hover`, `:active` and `:focus` for elements the browser never displays. The
 * pointer is never "over" such an element, so those rules would never apply.
 * Each rule that uses one of them gets a twin, right after it in the same layer
 * and media query, keyed on an attribute the Rune stage sets instead:
 * `[data-jg-hover]`, `[data-jg-active]`, `[data-jg-focus]`.
 */

const STATES: readonly [RegExp, string][] = [
  [/:hover\b/g, "[data-jg-hover]"],
  [/:active\b/g, "[data-jg-active]"],
  [/:focus-visible\b/g, "[data-jg-focus]"],
  [/:focus-within\b/g, "[data-jg-focus-within]"],
  [/:focus\b/g, "[data-jg-focus]"],
];

const TWIN_MARK = "--jg-state-twin";
const seen = new WeakSet<CSSStyleSheet>();
const stateSelectors: Record<"hover" | "active" | "focus", string[]> = { hover: [], active: [], focus: [] };

function rewrite(selector: string): string | null {
  let out = selector;
  for (const [pattern, attribute] of STATES) out = out.replace(pattern, attribute);
  return out === selector ? null : out;
}

function twinRules(owner: CSSStyleSheet | CSSGroupingRule | CSSStyleRule): void {
  let rules: CSSRuleList;
  try {
    rules = owner.cssRules;
  } catch {
    return; // A cross-origin sheet cannot be read.
  }
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (rule === undefined) continue;
    if (rule instanceof CSSStyleRule) {
      if (rule.style.getPropertyValue(TWIN_MARK) !== "") continue;
      const selector = rewrite(rule.selectorText);
      if (selector !== null) {
        const body = rule.cssText.slice(rule.cssText.indexOf("{") + 1, rule.cssText.lastIndexOf("}"));
        try {
          owner.insertRule(`${selector} { ${TWIN_MARK}: 1; ${body} }`, index + 1);
          index += 1;
          if (selector.includes("[data-jg-hover]")) stateSelectors.hover.push(selector);
          if (selector.includes("[data-jg-active]")) stateSelectors.active.push(selector);
          if (selector.includes("[data-jg-focus")) stateSelectors.focus.push(selector);
        } catch {
          // A selector this engine cannot parse stays without a twin.
        }
        continue;
      }
      if (rule.cssRules.length > 0) twinRules(rule);
      continue;
    }
    if ("cssRules" in rule) twinRules(rule as CSSGroupingRule);
  }
}

/** Give every state rule in the document its attribute twin. Sheets already done are skipped. */
export function twinStateRules(): void {
  for (const sheet of document.styleSheets) {
    if (seen.has(sheet)) continue;
    seen.add(sheet);
    twinRules(sheet);
  }
}

/**
 * Whether marking `element` with the state's attribute would change how it or anything under it
 * is styled. Marking every ancestor of a hovered element would re-mirror the whole layer; this
 * keeps the mark to the elements a rule actually reads it on.
 */
export function stateMatters(element: Element, state: "hover" | "active" | "focus", attribute: string): boolean {
  const selectors = stateSelectors[state];
  if (selectors.length === 0) return false;
  const had = element.hasAttribute(attribute);
  if (!had) element.setAttribute(attribute, "");
  let matters = false;
  try {
    const list = selectors.join(",");
    matters = element.matches(list) || element.querySelector(list) !== null;
  } catch {
    matters = true;
  }
  if (!had) element.removeAttribute(attribute);
  return matters;
}
