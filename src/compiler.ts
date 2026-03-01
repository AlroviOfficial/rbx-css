import { parseCSS } from "./parser/css-parser.ts";
import { extractTokens } from "./ir/tokens.ts";
import { extractThemes } from "./ir/themes.ts";
import { mapSelector } from "./mappers/selector.ts";
import { mapDeclarations } from "./mappers/properties.ts";
import { isDataThemeSelector } from "./mappers/selector.ts";
import type { StyleSheetIR, StyleRuleIR, RobloxValue } from "./ir/types.ts";
import { WarningCollector, type WarningLevel } from "./warnings.ts";
import type { SelectorComponent } from "lightningcss";

export interface CompileOptions {
  name: string;
  warnLevel: WarningLevel;
  strict: boolean;
  includeBaseRules?: boolean;
}

export interface CompileResult {
  ir: StyleSheetIR;
  warnings: WarningCollector;
  overflowScrollClasses: Map<string, boolean>;
}

export function compile(
  sources: Array<{ filename: string; content: string }>,
  options: CompileOptions
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
    warnings
  );

  // 3b. Extract rules from media queries that apply universally in Roblox
  // e.g., @media (hover: hover) — Roblox always supports hover
  for (const mediaRule of allMediaRules) {
    const query = mediaRule.query as Record<string, unknown>;
    if (isUniversalMediaQuery(query)) {
      for (const rule of mediaRule.rules) {
        nonRootRules.push(rule);
      }
    }
  }

  // 4. Filter out theme-only rules (data-theme attribute selectors)
  const styleRules = nonRootRules.filter((rule) => {
    return !isDataThemeSelector(rule.selectors as SelectorComponent[][]);
  });

  // 5. Map remaining rules to IR
  const irRules: StyleRuleIR[] = [];
  const overflowScrollClasses = new Map<string, boolean>();

  for (const rule of styleRules) {
    for (const selectorComponents of rule.selectors) {
      const mappedSelector = mapSelector(
        selectorComponents as Array<{
          type: string;
          name?: string;
          kind?: string;
          value?: string;
        }>,
        warnings
      );
      if (!mappedSelector) continue;

      const { properties, pseudoInstances, overflowScroll } = mapDeclarations(
        rule.declarations,
        warnings
      );

      // Track overflow:scroll per class selector for the manifest
      const classMatches = mappedSelector.match(/\.([a-zA-Z0-9_-]+)/g);
      if (classMatches) {
        for (const match of classMatches) {
          const className = match.slice(1);
          if (overflowScroll) {
            overflowScrollClasses.set(className, true);
          } else if (!overflowScrollClasses.has(className)) {
            overflowScrollClasses.set(className, false);
          }
        }
      }

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

  // 5a. Add base Roblox element rules (CSS equivalent of browser defaults)
  // In CSS, text elements auto-size to content. In Roblox, AutomaticSize must be set explicitly.
  // These element-type selectors have low specificity, so class-based rules override them.
  if (options.includeBaseRules !== false) {
    generateBaseElementRules(irRules);
  }

  // 5b. Generate compound selectors for width+height combinations
  // CSS has separate width/height but Roblox has a single Size UDim2.
  // When utility classes like .w-full and .h-full are applied to the same element,
  // their Size values overwrite each other. Fix by generating compound selectors
  // (e.g., .w-full.h-full) with the correctly combined Size.
  generateSizeCompoundRules(irRules);

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

  return { ir, warnings, overflowScrollClasses };
}

/**
 * Add base element rules that mimic browser defaults for Roblox instances.
 * In CSS, text elements auto-size to their content. In Roblox, this requires
 * explicit AutomaticSize. These use element-type selectors (lowest specificity).
 */
function generateBaseElementRules(irRules: StyleRuleIR[]): void {
  const autoSizeXY: RobloxValue = {
    type: "Enum",
    enum: "AutomaticSize",
    value: "XY",
  };
  const transparentBg: RobloxValue = { type: "number", value: 1 };

  // TextLabel: auto-size to text content, transparent background (like <span>)
  const textLabelProps = new Map<string, RobloxValue>();
  textLabelProps.set("AutomaticSize", autoSizeXY);
  textLabelProps.set("BackgroundTransparency", transparentBg);
  irRules.unshift({
    selector: "TextLabel",
    properties: textLabelProps,
    pseudoInstances: [],
  });

  // TextButton: auto-size to text content (like <button>)
  const textButtonProps = new Map<string, RobloxValue>();
  textButtonProps.set("AutomaticSize", autoSizeXY);
  irRules.unshift({
    selector: "TextButton",
    properties: textButtonProps,
    pseudoInstances: [],
  });

  // TextBox: auto-size to text content (like <input>)
  const textBoxProps = new Map<string, RobloxValue>();
  textBoxProps.set("AutomaticSize", autoSizeXY);
  irRules.unshift({
    selector: "TextBox",
    properties: textBoxProps,
    pseudoInstances: [],
  });
}

/**
 * Generate compound selectors to fix Size property conflicts.
 *
 * CSS has separate `width` and `height` properties, but Roblox combines them
 * into a single `Size` UDim2. When Tailwind generates `.w-full { width: 100% }`
 * and `.h-full { height: 100% }` as separate rules, they each set the full Size
 * and overwrite the other axis to 0.
 *
 * This function identifies width-only and height-only Size rules, then generates
 * compound selectors (e.g., `.w-full.h-full`) with the correctly merged Size.
 * Compound selectors have higher CSS specificity, so they naturally win.
 */
function generateSizeCompoundRules(irRules: StyleRuleIR[]): void {
  // Collect rules that set Size with only one meaningful axis
  type SizeAxis = {
    selector: string;
    udim2: [number, number, number, number];
    hasAuto: string | null;
  };
  const widthRules: SizeAxis[] = []; // X axis set, Y axis is 0,0
  const heightRules: SizeAxis[] = []; // Y axis set, X axis is 0,0

  for (const rule of irRules) {
    // Only look at simple class selectors (e.g., ".w-full", not compound/pseudo)
    if (
      !rule.selector.match(/^\.[a-zA-Z0-9_-]+$/) &&
      !rule.selector.match(/^\.[a-zA-Z0-9_-]+\[/)
    )
      continue;

    const sizeVal = rule.properties.get("Size");
    const autoVal = rule.properties.get("AutomaticSize");
    if (!sizeVal || sizeVal.type !== "UDim2") continue;

    const [xScale, xOffset, yScale, yOffset] = sizeVal.value;
    const autoStr = autoVal && autoVal.type === "Enum" ? autoVal.value : null;

    const xIsSet = xScale !== 0 || xOffset !== 0;
    const yIsSet = yScale !== 0 || yOffset !== 0;

    if (xIsSet && !yIsSet) {
      widthRules.push({
        selector: rule.selector,
        udim2: sizeVal.value,
        hasAuto: autoStr,
      });
    } else if (yIsSet && !xIsSet) {
      heightRules.push({
        selector: rule.selector,
        udim2: sizeVal.value,
        hasAuto: autoStr,
      });
    }
  }

  // Also collect auto-only rules (w-auto, h-auto) that don't set Size but set AutomaticSize
  for (const rule of irRules) {
    if (!rule.selector.match(/^\.[a-zA-Z0-9_-]+$/)) continue;
    const autoVal = rule.properties.get("AutomaticSize");
    const sizeVal = rule.properties.get("Size");
    if (!autoVal || autoVal.type !== "Enum" || sizeVal) continue;

    if (autoVal.value === "X") {
      widthRules.push({
        selector: rule.selector,
        udim2: [0, 0, 0, 0],
        hasAuto: "X",
      });
    } else if (autoVal.value === "Y") {
      heightRules.push({
        selector: rule.selector,
        udim2: [0, 0, 0, 0],
        hasAuto: "Y",
      });
    }
  }

  if (widthRules.length === 0 || heightRules.length === 0) return;

  // Generate compound rules for every width × height combination
  for (const w of widthRules) {
    for (const h of heightRules) {
      const compoundSelector = `${w.selector}${h.selector}`;
      const props = new Map<string, RobloxValue>();

      // Determine AutomaticSize
      const xAuto = w.hasAuto === "X";
      const yAuto = h.hasAuto === "Y";

      if (xAuto && yAuto) {
        props.set("AutomaticSize", {
          type: "Enum",
          enum: "AutomaticSize",
          value: "XY",
        });
      } else if (xAuto) {
        props.set("AutomaticSize", {
          type: "Enum",
          enum: "AutomaticSize",
          value: "X",
        });
        if (h.udim2[2] !== 0 || h.udim2[3] !== 0) {
          props.set("Size", {
            type: "UDim2",
            value: [0, 0, h.udim2[2], h.udim2[3]],
          });
        }
      } else if (yAuto) {
        props.set("AutomaticSize", {
          type: "Enum",
          enum: "AutomaticSize",
          value: "Y",
        });
        if (w.udim2[0] !== 0 || w.udim2[1] !== 0) {
          props.set("Size", {
            type: "UDim2",
            value: [w.udim2[0], w.udim2[1], 0, 0],
          });
        }
      } else {
        // Both concrete — merge X from width rule, Y from height rule
        props.set("Size", {
          type: "UDim2",
          value: [w.udim2[0], w.udim2[1], h.udim2[2], h.udim2[3]],
        });
      }

      if (props.size > 0) {
        irRules.push({
          selector: compoundSelector,
          properties: props,
          pseudoInstances: [],
        });
      }
    }
  }
}

/**
 * Check if a media query condition always applies in Roblox.
 * e.g., @media (hover: hover) — Roblox always has hover (mouse cursor).
 * These rules get unwrapped and treated as regular style rules.
 */
function isUniversalMediaQuery(query: Record<string, unknown>): boolean {
  // lightningcss represents media queries as { mediaQueries: [...] }
  const queries = query.mediaQueries as unknown[];
  if (!queries || queries.length !== 1) return false;

  const q = queries[0] as Record<string, unknown>;
  // Check for (hover: hover)
  if (q.condition) {
    const cond = q.condition as Record<string, unknown>;
    if (cond.type === "feature") {
      const feature = cond.value as Record<string, unknown>;
      if (feature.type === "plain") {
        // The "plain" feature has name (e.g. "hover") and value (e.g. {type:"ident",value:"hover"})
        // at this level — don't dereference into feature.value
        if (
          (feature.name === "hover" || feature.name === "pointer") &&
          feature.value !== undefined
        ) {
          return true;
        }
      }
    }
  }
  return false;
}
