import type { ParsedStyleSheet, ParsedRule } from "../parser/css-parser.ts";
import type { TokenValue } from "./types.ts";
import type { WarningCollector } from "../warnings.ts";
import { convertCssColor } from "../mappers/colors.ts";

export function extractThemes(
  parsed: ParsedStyleSheet,
  warnings: WarningCollector,
): Map<string, Map<string, TokenValue>> {
  const themes = new Map<string, Map<string, TokenValue>>();

  // 1. Extract from [data-theme="xxx"] attribute selectors
  for (const rule of parsed.rules) {
    const themeName = extractDataThemeAttribute(rule.selectors);
    if (themeName) {
      const themeTokens = themes.get(themeName) ?? new Map();
      extractCustomProperties(rule.declarations, themeTokens, warnings);
      themes.set(themeName, themeTokens);
    }
  }

  // 2. Extract from @media (prefers-color-scheme: xxx)
  for (const media of parsed.mediaRules) {
    const scheme = extractColorScheme(media.query);
    if (scheme) {
      const themeTokens = themes.get(scheme) ?? new Map();
      for (const rule of media.rules) {
        if (isRootSelector(rule.selectors)) {
          extractCustomProperties(rule.declarations, themeTokens, warnings);
        }
      }
      themes.set(scheme, themeTokens);
    }
  }

  return themes;
}

function extractDataThemeAttribute(selectors: unknown[][]): string | null {
  for (const sel of selectors) {
    for (const comp of sel) {
      const c = comp as Record<string, unknown>;
      if (c.type === "attribute") {
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

function extractColorScheme(query: unknown): string | null {
  // Walk media query structure to find prefers-color-scheme
  return findColorScheme(query);
}

function findColorScheme(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;

  const o = obj as Record<string, unknown>;

  // Check for prefers-color-scheme feature
  if (o.type === "feature") {
    const value = o.value as Record<string, unknown> | undefined;
    if (value?.type === "plain") {
      const name = value.name as string | undefined;
      if (name === "prefers-color-scheme") {
        const featureValue = value.value as Record<string, unknown> | undefined;
        if (featureValue?.type === "ident") {
          return featureValue.value as string;
        }
      }
    }
  }

  // Recurse into arrays and objects
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findColorScheme(item);
      if (found) return found;
    }
  } else {
    for (const val of Object.values(o)) {
      const found = findColorScheme(val);
      if (found) return found;
    }
  }

  return null;
}

function isRootSelector(selectors: unknown[][]): boolean {
  return selectors.some((sel) => {
    if (sel.length !== 1) return false;
    const comp = sel[0] as Record<string, unknown>;
    return comp.type === "pseudo-class" && comp.kind === "root";
  });
}

function extractCustomProperties(
  declarations: unknown[],
  tokens: Map<string, TokenValue>,
  warnings: WarningCollector,
): void {
  for (const decl of declarations) {
    const d = decl as Record<string, unknown>;
    if (d.property === "custom") {
      const val = d.value as Record<string, unknown>;
      const name = (val.name as string).replace(/^--/, "");
      const tokenValue = inferTokenValue(val.value as unknown[]);
      if (tokenValue) {
        tokens.set(name, tokenValue);
      }
    }
  }
}

function inferTokenValue(tokens: unknown[]): TokenValue | null {
  if (!tokens || tokens.length === 0) return null;

  const first = tokens[0] as Record<string, unknown>;

  if (first.type === "color") {
    const colorResult = convertCssColor(first.value);
    if (colorResult) {
      return { type: "Color3", value: colorResult.color };
    }
  }

  if (first.type === "length") {
    const val = first.value as Record<string, unknown>;
    if (val.unit === "px") {
      return { type: "UDim", value: [0, val.value as number] };
    }
  }

  if (first.type === "token") {
    const tok = first.value as Record<string, unknown>;
    if (tok.type === "string") {
      return { type: "string", value: tok.value as string };
    }
    if (tok.type === "number") {
      return { type: "number", value: tok.value as number };
    }
  }

  return null;
}
