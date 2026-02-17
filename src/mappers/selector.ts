import { HTML_TO_ROBLOX } from "../mappings/elements.ts";
import { ROBLOX_GUI_CLASSES } from "../mappings/roblox-classes.ts";
import { CSS_TO_ROBLOX_PSEUDO } from "../mappings/pseudo-classes.ts";
import type { WarningCollector } from "../warnings.ts";

interface SelectorComponent {
  type: string;
  name?: string;
  kind?: string;
  value?: string;
}

export function mapSelector(
  components: SelectorComponent[],
  warnings: WarningCollector,
): string | null {
  const parts: string[] = [];

  for (const comp of components) {
    switch (comp.type) {
      case "class":
        parts.push(`.${comp.name}`);
        break;

      case "id":
        parts.push(`#${comp.name}`);
        break;

      case "type": {
        const name = comp.name!;
        if (ROBLOX_GUI_CLASSES.has(name)) {
          parts.push(name);
        } else if (HTML_TO_ROBLOX[name]) {
          parts.push(HTML_TO_ROBLOX[name]!);
        } else {
          parts.push(name);
          warnings.warn({
            code: "unsupported-selector",
            message: `Unknown element '${name}', passing through as-is`,
          });
        }
        break;
      }

      case "pseudo-class": {
        const kind = comp.kind!;
        const mapped = CSS_TO_ROBLOX_PSEUDO[kind];
        if (mapped) {
          parts.push(`:${mapped}`);
        } else if (kind === "root") {
          // :root is handled by token extraction, skip
          return null;
        } else {
          warnings.warn({
            code: "unsupported-selector",
            message: `Pseudo-class ':${kind}' has no Roblox equivalent`,
          });
        }
        break;
      }

      case "combinator":
        if (comp.value === "child") {
          parts.push(" > ");
        } else if (comp.value === "descendant") {
          parts.push(" ");
        } else {
          warnings.warn({
            code: "unsupported-selector",
            message: `Combinator '${comp.value}' not supported in Roblox`,
          });
          return null;
        }
        break;

      case "universal":
        warnings.warn({
          code: "unsupported-selector",
          message: "Universal selector '*' not supported in Roblox",
        });
        return null;

      case "attribute":
        // [data-theme="..."] handled by theme extraction
        return null;

      default:
        break;
    }
  }

  return parts.join("") || null;
}

export function isRootSelector(selectors: SelectorComponent[][]): boolean {
  return selectors.some(
    (sel) =>
      sel.length === 1 &&
      sel[0]!.type === "pseudo-class" &&
      sel[0]!.kind === "root",
  );
}

export function isDataThemeSelector(
  selectors: SelectorComponent[][],
): string | null {
  for (const sel of selectors) {
    for (const comp of sel) {
      if (comp.type === "attribute") {
        const c = comp as Record<string, unknown>;
        if (c.name === "data-theme") {
          const op = c.operation as Record<string, unknown> | undefined;
          if (op?.operator === "equal") {
            return op.value as string;
          }
        }
      }
    }
  }
  return null;
}
