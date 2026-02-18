import { HTML_TO_ROBLOX } from "./mappings/elements.ts";

export interface CSSManifest {
  classes: Record<string, { overflowScroll: boolean }>;
  elementMap: Record<string, string>;
}

export function generateManifest(
  overflowScrollClasses: Map<string, boolean>,
): CSSManifest {
  const classes: Record<string, { overflowScroll: boolean }> = {};
  for (const [className, overflowScroll] of overflowScrollClasses) {
    classes[className] = { overflowScroll };
  }

  const elementMap: Record<string, string> = { ...HTML_TO_ROBLOX };

  return { classes, elementMap };
}
