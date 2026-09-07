import { HTML_TO_ROBLOX } from "./mappings/elements.ts";
import { BASE_RULE_TAG } from "./base-rule-tag.ts";

export interface CSSManifest {
  classes: Record<
    string,
    { overflowScroll: boolean; explicitOrder?: boolean }
  >;
  elementMap: Record<string, string>;
  /** Tag the renderer must apply to every element it creates. */
  elementTag: string;
}

export function generateManifest(
  overflowScrollClasses: Map<string, boolean>,
  explicitOrderClasses?: Map<string, boolean>
): CSSManifest {
  const classes: Record<
    string,
    { overflowScroll: boolean; explicitOrder?: boolean }
  > = {};
  for (const [className, overflowScroll] of overflowScrollClasses) {
    classes[className] = { overflowScroll };
  }
  if (explicitOrderClasses) {
    for (const [className, explicitOrder] of explicitOrderClasses) {
      const entry = classes[className] ?? { overflowScroll: false };
      entry.explicitOrder = explicitOrder;
      classes[className] = entry;
    }
  }

  const elementMap: Record<string, string> = { ...HTML_TO_ROBLOX };

  return { classes, elementMap, elementTag: BASE_RULE_TAG };
}
