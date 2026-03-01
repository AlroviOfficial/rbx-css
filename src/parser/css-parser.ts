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

/**
 * Resolve CSS nesting by replacing {type: "nesting"} tokens in a child selector
 * with the parent selector components.
 *
 * Example: parent = [{type:"class",name:"foo"}], child = [{type:"nesting"},{type:"pseudo-class",kind:"hover"}]
 * Result: [{type:"class",name:"foo"},{type:"pseudo-class",kind:"hover"}]
 */
function resolveNestingSelector(
  parentSelectors: unknown[][],
  childSelectors: unknown[][]
): unknown[][] {
  const resolved: unknown[][] = [];

  for (const childSel of childSelectors) {
    // Check if the child selector contains a nesting token (&)
    const nestingIndex = childSel.findIndex(
      (comp: unknown) => (comp as Record<string, unknown>).type === "nesting"
    );

    if (nestingIndex === -1) {
      // No nesting token — implicit nesting: prepend each parent selector
      for (const parentSel of parentSelectors) {
        // Implicit nesting adds a descendant combinator
        resolved.push([
          ...parentSel,
          { type: "combinator", value: "descendant" },
          ...childSel,
        ]);
      }
    } else {
      // Replace the nesting token with each parent selector
      for (const parentSel of parentSelectors) {
        const newSel = [
          ...childSel.slice(0, nestingIndex),
          ...parentSel,
          ...childSel.slice(nestingIndex + 1),
        ];
        resolved.push(newSel);
      }
    }
  }

  return resolved;
}

/**
 * Resolve a full selector stack by iteratively resolving each nesting level.
 * The stack goes from outermost (index 0) to innermost (last index).
 */
function resolveFullSelectorStack(selectorStack: unknown[][][]): unknown[][] {
  if (selectorStack.length === 0) return [];
  if (selectorStack.length === 1) return selectorStack[0]!;

  let resolved = selectorStack[0]!;
  for (let i = 1; i < selectorStack.length; i++) {
    resolved = resolveNestingSelector(resolved, selectorStack[i]!);
  }
  return resolved;
}

export function parseCSS(source: string, filename: string): ParsedStyleSheet {
  const collectedRules: ParsedRule[] = [];
  const collectedMedia: ParsedMediaRule[] = [];

  // Track media query context for rules nested inside @media
  const mediaStack: Array<{ query: unknown; entry: ParsedMediaRule }> = [];

  // Track CSS nesting selector context for resolving nested-declarations
  const selectorStack: unknown[][][] = [];

  transform({
    filename,
    code: Buffer.from(source),
    visitor: {
      Rule(rule: Record<string, unknown>) {
        if (rule.type === "media") {
          const value = rule.value as Record<string, unknown>;
          const query = JSON.parse(JSON.stringify(value.query));

          const entry: ParsedMediaRule = { query, rules: [] };

          // Child rules inside the media block are collected via the visitor
          // traversal (style rules and nested-declarations will be visited and
          // added to this entry via the mediaStack).
          collectedMedia.push(entry);
          mediaStack.push({ query, entry });
        } else if (rule.type === "style") {
          const value = rule.value as Record<string, unknown>;
          const selectors = value.selectors as unknown[][];
          const decls = value.declarations as Record<string, unknown>;

          // Push selector for nesting resolution
          selectorStack.push(selectors);

          const parsed: ParsedRule = {
            selectors: JSON.parse(JSON.stringify(selectors)),
            declarations: JSON.parse(
              JSON.stringify(decls.declarations as unknown[])
            ),
          };

          // Only collect rules that have actual declarations
          if (parsed.declarations.length > 0) {
            if (mediaStack.length > 0) {
              // Inside a media query — add to the innermost media entry
              mediaStack[mediaStack.length - 1]!.entry.rules.push(parsed);
            } else {
              collectedRules.push(parsed);
            }
          }
        } else if (rule.type === "nested-declarations") {
          // Handle nested-declarations outside of media (inside CSS nesting)
          const value = rule.value as Record<string, unknown>;
          const decls = value.declarations as Record<string, unknown>;
          const declarations = JSON.parse(
            JSON.stringify(decls.declarations as unknown[])
          );

          if (declarations.length > 0 && selectorStack.length > 0) {
            const resolvedSelectors = resolveFullSelectorStack(
              selectorStack.map((s) => JSON.parse(JSON.stringify(s)))
            );
            const parsed: ParsedRule = {
              selectors: resolvedSelectors,
              declarations,
            };

            if (mediaStack.length > 0) {
              mediaStack[mediaStack.length - 1]!.entry.rules.push(parsed);
            } else {
              collectedRules.push(parsed);
            }
          }
        }
      },
      RuleExit(rule: Record<string, unknown>) {
        if (rule.type === "media") {
          mediaStack.pop();
        } else if (rule.type === "style") {
          selectorStack.pop();
        }
      },
    },
  });

  return { rules: collectedRules, mediaRules: collectedMedia };
}
