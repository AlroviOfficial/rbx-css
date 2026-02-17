import { parseCSS } from "./parser/css-parser.ts";
import { extractTokens } from "./ir/tokens.ts";
import { extractThemes } from "./ir/themes.ts";
import { mapSelector } from "./mappers/selector.ts";
import { mapDeclarations } from "./mappers/properties.ts";
import { isDataThemeSelector } from "./mappers/selector.ts";
import type { StyleSheetIR, StyleRuleIR } from "./ir/types.ts";
import { WarningCollector, type WarningLevel } from "./warnings.ts";

export interface CompileOptions {
  name: string;
  warnLevel: WarningLevel;
  strict: boolean;
}

export interface CompileResult {
  ir: StyleSheetIR;
  warnings: WarningCollector;
}

export function compile(
  sources: Array<{ filename: string; content: string }>,
  options: CompileOptions,
): CompileResult {
  const warnings = new WarningCollector(options.warnLevel, options.strict);

  // 1. Parse all CSS sources
  const allParsed = sources.map((s) => parseCSS(s.content, s.filename));

  const allRules = allParsed.flatMap((p) => p.rules);
  const allMediaRules = allParsed.flatMap((p) => p.mediaRules);

  // 2. Extract tokens from :root
  const { tokens, nonRootRules } = extractTokens(allRules, warnings);

  // 3. Extract themes
  const themes = extractThemes(
    { rules: allRules, mediaRules: allMediaRules },
    warnings,
  );

  // 4. Filter out theme-only rules (data-theme attribute selectors)
  const styleRules = nonRootRules.filter((rule) => {
    return !isDataThemeSelector(rule.selectors);
  });

  // 5. Map remaining rules to IR
  const irRules: StyleRuleIR[] = [];

  for (const rule of styleRules) {
    for (const selectorComponents of rule.selectors) {
      const mappedSelector = mapSelector(
        selectorComponents as Array<{
          type: string;
          name?: string;
          kind?: string;
          value?: string;
        }>,
        warnings,
      );
      if (!mappedSelector) continue;

      const { properties, pseudoInstances } = mapDeclarations(
        rule.declarations,
        warnings,
      );

      // Main rule with direct properties
      if (properties.size > 0) {
        irRules.push({
          selector: mappedSelector,
          properties,
          pseudoInstances: [],
        });
      }

      // Pseudo-instance rules
      for (const pseudo of pseudoInstances) {
        irRules.push({
          selector: `${mappedSelector}::${pseudo.type}`,
          properties: pseudo.properties,
          pseudoInstances: [],
        });
      }
    }
  }

  // 6. Build theme StyleSheetIRs
  const themeMap = new Map<string, StyleSheetIR>();
  for (const [themeName, themeTokens] of themes) {
    themeMap.set(themeName, {
      name: `${options.name}_${themeName}`,
      tokens: themeTokens,
      rules: [],
    });
  }

  const ir: StyleSheetIR = {
    name: options.name,
    tokens,
    rules: irRules,
    themes: themeMap.size > 0 ? themeMap : undefined,
  };

  return { ir, warnings };
}
