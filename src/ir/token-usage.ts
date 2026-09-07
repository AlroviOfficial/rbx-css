import type { RobloxValue, StyleSheetIR } from "./types.ts";
import type { WarningCollector } from "../warnings.ts";

/**
 * Style properties Roblox types as a plain number rather than a UDim.
 *
 * A CSS length token is stored as a UDim because that is what a size or an
 * offset needs, but these properties reject one outright: applying the rule
 * fails at runtime with a cast error and the property keeps its default, so
 * the mistyping is invisible until something is rendered.
 */
const NUMBER_PROPERTIES = new Set([
  "TextSize",
  "LineHeight",
  "LayoutOrder",
  "ZIndex",
  "BorderSizePixel",
  "Thickness",
  "Rotation",
  "AspectRatio",
  "Transparency",
  "BackgroundTransparency",
  "ImageTransparency",
  "TextTransparency",
  "TextStrokeTransparency",
  "GroupTransparency",
  "FillTransparency",
]);

/**
 * Re-type :root tokens that are only ever read as numbers.
 *
 * Nothing at the declaration site says whether `--text-lg: 18px` is a size or
 * a text height; only the properties referencing it do. Every reference is
 * collected first, and a length token used exclusively by number-typed
 * properties is emitted as a number so the reference resolves.
 */
export function reconcileTokenTypes(
  sheet: StyleSheetIR,
  warnings: WarningCollector,
): void {
  const usage = new Map<string, Set<string>>();

  const collect = (properties: Map<string, RobloxValue>) => {
    for (const [property, value] of properties) {
      if (value.type !== "token") continue;
      let seen = usage.get(value.name);
      if (!seen) {
        seen = new Set();
        usage.set(value.name, seen);
      }
      seen.add(property);
    }
  };

  for (const rule of sheet.rules) {
    collect(rule.properties);
    for (const pseudo of rule.pseudoInstances) collect(pseudo.properties);
  }

  const renamed: string[] = [];

  for (const [name, properties] of usage) {
    const token = sheet.tokens.get(name);
    if (!token || token.type !== "UDim") continue;

    const numeric = [...properties].filter((p) => NUMBER_PROPERTIES.has(p));
    if (numeric.length === 0) continue;

    if (numeric.length < properties.size) {
      const other = [...properties].filter((p) => !NUMBER_PROPERTIES.has(p));
      warnings.warn({
        code: "type-inference-ambiguous",
        message:
          `token '--${name}' is read as a number by ${numeric.join(", ")} and ` +
          `as a UDim by ${other.join(", ")}; kept as a UDim, so the number ` +
          `properties will not apply`,
      });
      continue;
    }

    const [scale, offset] = token.value;
    if (scale !== 0) {
      warnings.warn({
        code: "type-inference-ambiguous",
        message:
          `token '--${name}' is a relative length but ${numeric.join(", ")} ` +
          `needs an absolute number; kept as a UDim`,
      });
      continue;
    }

    sheet.tokens.set(name, { type: "number", value: offset });
    renamed.push(name);
  }

  // A theme overriding one of these has to agree on the type, or switching to
  // it reintroduces the cast failure the base sheet just avoided.
  if (!sheet.themes) return;
  for (const theme of sheet.themes.values()) {
    for (const name of renamed) {
      const override = theme.tokens.get(name);
      if (override?.type === "UDim" && override.value[0] === 0) {
        theme.tokens.set(name, { type: "number", value: override.value[1] });
      }
    }
  }
}
