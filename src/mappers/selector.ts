import { HTML_TO_ROBLOX } from "../mappings/elements.ts";
import { ROBLOX_GUI_CLASSES } from "../mappings/roblox-classes.ts";
import { CSS_TO_ROBLOX_PSEUDO } from "../mappings/pseudo-classes.ts";
import type { WarningCollector } from "../warnings.ts";

// HTML elements from browser resets/preflights that have no Roblox equivalent.
// Rules targeting these are silently dropped instead of passed through.
// NOTE: Elements supported by rbx-tsx are in HTML_TO_ROBLOX, not here.
const IGNORED_HTML_ELEMENTS = new Set([
  "html",
  "body",
  "head",
  "meta",
  "link",
  "style",
  "script",
  "noscript",
  "hr",
  "br",
  "b",
  "i",
  "em",
  "strong",
  "u",
  "s",
  "mark",
  "small",
  "sub",
  "sup",
  "code",
  "kbd",
  "samp",
  "pre",
  "blockquote",
  "cite",
  "q",
  "abbr",
  "address",
  "dl",
  "dt",
  "dd",
  "menu",
  "caption",
  "colgroup",
  "col",
  "fieldset",
  "legend",
  "figure",
  "figcaption",
  "audio",
  "source",
  "track",
  "embed",
  "object",
  "iframe",
  "svg",
  "picture",
  "progress",
  "meter",
  "output",
  "map",
  "area",
  "ruby",
  "rt",
  "rp",
  "wbr",
  "data",
  "time",
  "var",
  "dfn",
  "ins",
  "del",
]);

// Pseudo-classes from browser resets/preflights that have no Roblox equivalent.
// Rules with these are silently dropped.
const IGNORED_PSEUDO_CLASSES = new Set([
  "host",
  "where",
  "is",
  "has",
  "not",
  "first-child",
  "last-child",
  "nth-child",
  "nth-last-child",
  "first-of-type",
  "last-of-type",
  "only-child",
  "only-of-type",
  "empty",
  "checked",
  "indeterminate",
  "default",
  "valid",
  "invalid",
  "required",
  "optional",
  "read-only",
  "read-write",
  "placeholder-shown",
  "autofill",
  "enabled",
  "link",
  "visited",
  "any-link",
  "target",
  "scope",
  "defined",
  "before",
  "after",
  "placeholder",
  "selection",
  "marker",
  "backdrop",
  "custom",
]);

interface SelectorComponent {
  type: string;
  name?: string;
  kind?: string;
  value?: string;
}

/**
 * Escape characters in a CSS identifier that have special meaning in selectors.
 * lightningcss gives us unescaped names (e.g. "text-[22px]", "hover:bg-red",
 * "gap-0.5"), but Roblox's selector parser interprets [, ], :, . etc. as syntax.
 * Re-escape them with backslash so the selector matches the literal tag name.
 */
function escapeSelectorIdent(name: string): string {
  return name.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

export function mapSelector(
  components: SelectorComponent[],
  warnings: WarningCollector
): string | null {
  const parts: string[] = [];

  for (const comp of components) {
    switch (comp.type) {
      case "class":
        parts.push(`.${escapeSelectorIdent(comp.name!)}`);
        break;

      case "id":
        parts.push(`#${escapeSelectorIdent(comp.name!)}`);
        break;

      case "type": {
        const name = comp.name!;
        if (ROBLOX_GUI_CLASSES.has(name)) {
          parts.push(name);
        } else if (HTML_TO_ROBLOX[name]) {
          parts.push(HTML_TO_ROBLOX[name]!);
        } else if (IGNORED_HTML_ELEMENTS.has(name)) {
          // HTML-only element from browser resets, silently drop
          return null;
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
        } else if (IGNORED_PSEUDO_CLASSES.has(kind)) {
          // Browser-only pseudo-class, silently drop the rule
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
          // Roblox's matcher resolves '>' but never a bare descendant, so the
          // rule compiles cleanly and then silently never applies to anything.
          parts.push(" ");
          warnings.warn({
            code: "unsupported-selector",
            message:
              "Descendant combinator (space) never matches in Roblox; write '>' between every level to target a direct child",
          });
        } else {
          warnings.warn({
            code: "unsupported-selector",
            message: `Combinator '${comp.value}' not supported in Roblox`,
          });
          return null;
        }
        break;

      case "universal":
        // Universal selector has no Roblox equivalent, silently drop
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
      sel[0]!.kind === "root"
  );
}

export function isDataThemeSelector(
  selectors: SelectorComponent[][]
): string | null {
  for (const sel of selectors) {
    for (const comp of sel) {
      if (comp.type === "attribute") {
        const c = comp as unknown as Record<string, unknown>;
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
