import { transform } from "lightningcss";

export interface ParsedRule {
  selectors: unknown[][];
  declarations: unknown[];
}

export interface ParsedMediaRule {
  query: unknown;
  rules: ParsedRule[];
}

export interface ParsedStyleSheet {
  rules: ParsedRule[];
  mediaRules: ParsedMediaRule[];
}

export function parseCSS(source: string, filename: string): ParsedStyleSheet {
  const collectedRules: ParsedRule[] = [];
  const collectedMedia: ParsedMediaRule[] = [];
  let insideMedia = false;

  transform({
    filename,
    code: Buffer.from(source),
    visitor: {
      Rule(rule: Record<string, unknown>) {
        if (rule.type === "style" && !insideMedia) {
          const value = rule.value as Record<string, unknown>;
          const selectors = value.selectors as unknown[][];
          const decls = value.declarations as Record<string, unknown>;
          collectedRules.push({
            selectors: JSON.parse(JSON.stringify(selectors)),
            declarations: JSON.parse(
              JSON.stringify(decls.declarations as unknown[]),
            ),
          });
        } else if (rule.type === "media") {
          const value = rule.value as Record<string, unknown>;
          const nestedRules: ParsedRule[] = [];
          const rules = value.rules as Record<string, unknown>[];
          if (rules) {
            for (const nested of rules) {
              if (nested.type === "style") {
                const nv = nested.value as Record<string, unknown>;
                const nDecls = nv.declarations as Record<string, unknown>;
                nestedRules.push({
                  selectors: JSON.parse(JSON.stringify(nv.selectors)),
                  declarations: JSON.parse(
                    JSON.stringify(nDecls.declarations as unknown[]),
                  ),
                });
              }
            }
          }
          collectedMedia.push({
            query: JSON.parse(JSON.stringify(value.query)),
            rules: nestedRules,
          });
          // Set flag so nested style rules from visitor traversal are skipped
          insideMedia = true;
        }
      },
      RuleExit(rule: Record<string, unknown>) {
        if (rule.type === "media") {
          insideMedia = false;
        }
      },
    },
  });

  return { rules: collectedRules, mediaRules: collectedMedia };
}
