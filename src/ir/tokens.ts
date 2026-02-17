import type { ParsedRule } from "../parser/css-parser.ts";
import type { TokenValue } from "./types.ts";
import type { WarningCollector } from "../warnings.ts";
import { convertCssColor } from "../mappers/colors.ts";
import { mapFontFamily } from "../mappers/fonts.ts";

export function extractTokens(
  rules: ParsedRule[],
  warnings: WarningCollector,
): { tokens: Map<string, TokenValue>; nonRootRules: ParsedRule[] } {
  const tokens = new Map<string, TokenValue>();
  const nonRootRules: ParsedRule[] = [];

  for (const rule of rules) {
    if (isRootSelector(rule.selectors)) {
      for (const decl of rule.declarations) {
        const d = decl as Record<string, unknown>;
        if (d.property === "custom") {
          const val = d.value as Record<string, unknown>;
          const name = (val.name as string).replace(/^--/, "");
          const tokenValue = inferTokenValue(
            val.value as unknown[],
            warnings,
          );
          if (tokenValue) {
            tokens.set(name, tokenValue);
          }
        }
      }
    } else {
      nonRootRules.push(rule);
    }
  }

  return { tokens, nonRootRules };
}

function isRootSelector(selectors: unknown[][]): boolean {
  return selectors.some((sel) => {
    if (sel.length !== 1) return false;
    const comp = sel[0] as Record<string, unknown>;
    return comp.type === "pseudo-class" && comp.kind === "root";
  });
}

function inferTokenValue(
  tokens: unknown[],
  warnings: WarningCollector,
): TokenValue | null {
  if (!tokens || tokens.length === 0) return null;

  const first = tokens[0] as Record<string, unknown>;

  // Color value
  if (first.type === "color") {
    const colorResult = convertCssColor(first.value);
    if (colorResult) {
      return { type: "Color3", value: colorResult.color };
    }
  }

  // Length value
  if (first.type === "length") {
    const val = first.value as Record<string, unknown>;
    if (val.unit === "px") {
      return { type: "UDim", value: [0, val.value as number] };
    }
    if (val.unit === "%") {
      return { type: "UDim", value: [(val.value as number) / 100, 0] };
    }
  }

  // Dimension value (another format)
  if (first.type === "dimension") {
    const val = first.value as Record<string, unknown>;
    if (val.unit === "px") {
      return { type: "UDim", value: [0, val.value as number] };
    }
  }

  // Token (raw string/number/ident)
  if (first.type === "token") {
    const tok = first.value as Record<string, unknown>;
    if (tok.type === "string") {
      // Could be font name
      return { type: "string", value: tok.value as string };
    }
    if (tok.type === "number") {
      return { type: "number", value: tok.value as number };
    }
    if (tok.type === "dimension") {
      const dim = tok.value as Record<string, unknown>;
      return {
        type: "UDim",
        value: [0, dim.value as number],
      };
    }
    if (tok.type === "ident") {
      return { type: "string", value: tok.value as string };
    }
  }

  // String directly
  if (typeof first === "string") {
    return { type: "string", value: first };
  }

  warnings.warn({
    code: "type-inference-ambiguous",
    message: "Cannot determine type for token value",
  });
  return null;
}
