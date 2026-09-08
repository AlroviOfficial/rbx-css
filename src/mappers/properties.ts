import type {
  RobloxValue,
  PseudoInstanceIR,
  TokenValue,
} from "../ir/types.ts";
import type { WarningCollector } from "../warnings.ts";
import { convertCssColor, parseNamedColor } from "./colors.ts";
import {
  convertLengthDimension,
  convertLengthValue,
  toUDim,
  type UDimResult,
} from "./units.ts";
import { mapFontFamily, mapFontWeight, mapFontStyle } from "./fonts.ts";

// CSS properties with no Roblox equivalent — silently skipped without warnings.
// Covers browser resets, Tailwind preflight, animations, transitions, etc.
const IGNORED_CSS_PROPERTIES = new Set([
  "box-sizing",
  "text-decoration",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-decoration-thickness",
  "text-size-adjust",
  "tab-size",
  "text-indent",
  "text-transform",
  "text-rendering",
  "text-shadow",
  "white-space",
  "word-spacing",
  "letter-spacing",
  "list-style",
  "list-style-type",
  "list-style-position",
  "list-style-image",
  "resize",
  "appearance",
  "bottom",
  "right",
  "float",
  "clear",
  "content",
  "counter-increment",
  "counter-reset",
  "quotes",
  "border-collapse",
  "border-spacing",
  "table-layout",
  "caption-side",
  "empty-cells",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-image",
  "border-image-source",
  "border-image-slice",
  "border-image-width",
  "border-image-outset",
  "border-image-repeat",
  "outline-offset",
  "background-position",
  "background-position-x",
  "background-position-y",
  "background-repeat",
  "background-size",
  "background-origin",
  "background-clip",
  "background-attachment",
  "transition",
  "transition-property",
  "transition-duration",
  "transition-timing-function",
  "transition-delay",
  "transition-behavior",
  "animation",
  "animation-name",
  "animation-duration",
  "animation-timing-function",
  "animation-delay",
  "animation-iteration-count",
  "animation-direction",
  "animation-fill-mode",
  "animation-play-state",
  "pointer-events",
  "user-select",
  "touch-action",
  "will-change",
  "contain",
  "isolation",
  "mix-blend-mode",
  "filter",
  "backdrop-filter",
  "clip-path",
  "mask",
  "mask-image",
  "object-position",
  "scroll-behavior",
  "scroll-margin",
  "scroll-padding",
  "overscroll-behavior",
  "hyphens",
  "writing-mode",
  "direction",
  "unicode-bidi",
  "columns",
  "column-count",
  "column-gap",
  "column-rule",
  "column-span",
  "column-width",
  "break-before",
  "break-after",
  "break-inside",
  "page-break-before",
  "page-break-after",
  "page-break-inside",
  "orphans",
  "widows",
  "accent-color",
  "caret-color",
  "color-scheme",
  "forced-color-adjust",
  "print-color-adjust",
]);

export interface PropertyMapResult {
  properties: Map<string, RobloxValue>;
  pseudoInstances: PseudoInstanceIR[];
  overflowScroll: boolean;
}

interface Accumulator {
  widthX?: UDimResult | "auto";
  heightY?: UDimResult | "auto";
  leftX?: UDimResult;
  topY?: UDimResult;
  hasFlex: boolean;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: RobloxValue;
  flexWrap?: boolean;
  flexGrow?: number;
  flexShrink?: number;
  paddingTop?: RobloxValue;
  paddingBottom?: RobloxValue;
  paddingLeft?: RobloxValue;
  paddingRight?: RobloxValue;
  borderWidth?: number;
  borderColor?: [number, number, number];
  /** A token reference, which outranks borderColor when both are present. */
  borderColorToken?: RobloxValue;
  borderTransparency?: number;
  borderStyle?: string;
  borderRadius?: RobloxValue;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  aspectRatio?: number;
  overflowScroll?: boolean;
  gradientRotation?: number;
  gradientStops?: Array<{
    position: number;
    color: [number, number, number];
  }>;
  scale?: number;
  rotation?: number;
  alignSelf?: string;
  flexBasis?: UDimResult;
  hasGrid?: boolean;
  gridMaxCellsPerRow?: number;
  gridCellWidth?: UDimResult;
  gridCellHeight?: UDimResult;
  gridGapX?: RobloxValue;
  gridGapY?: RobloxValue;
}

export function mapDeclarations(
  declarations: unknown[],
  warnings: WarningCollector,
  tokens?: Map<string, TokenValue>
): PropertyMapResult {
  const props = new Map<string, RobloxValue>();
  const acc: Accumulator = { hasFlex: false, hasGrid: false };

  for (const decl of declarations) {
    mapSingleDeclaration(
      decl as Record<string, unknown>,
      props,
      acc,
      warnings,
      tokens
    );
  }

  const pseudoInstances = finalizeAccumulator(acc, props, warnings);
  constrainWrappedText(props);
  return {
    properties: props,
    pseudoInstances,
    overflowScroll: acc.overflowScroll ?? false,
  };
}

/**
 * Stop a wrapping text element from growing along the axis it wraps in.
 *
 * Text wraps inside a box whose width its container decides, so a rule that
 * asks for wrapping without giving a width must not also auto-size on X — the
 * label would just grow to fit one line and never wrap. The width may still
 * arrive from a layout (flex-grow) or another rule, which is exactly the case
 * this covers.
 */
function constrainWrappedText(props: Map<string, RobloxValue>): void {
  const wrapped = props.get("TextWrapped");
  if (wrapped?.type !== "boolean" || !wrapped.value) return;
  if (props.has("Size")) return;

  const auto = props.get("AutomaticSize");
  const value = auto?.type === "Enum" ? auto.value : "XY";
  if (value !== "XY" && value !== "X") return;
  props.set("AutomaticSize", {
    type: "Enum",
    enum: "AutomaticSize",
    value: value === "XY" ? "Y" : "None",
  });
}

function mapSingleDeclaration(
  decl: Record<string, unknown>,
  props: Map<string, RobloxValue>,
  acc: Accumulator,
  warnings: WarningCollector,
  tokens?: Map<string, TokenValue>
): void {
  const property = decl.property as string;
  const value = decl.value;

  // CSS-only properties with no Roblox equivalent — silently skip
  if (IGNORED_CSS_PROPERTIES.has(property)) return;

  // Handle unparsed declarations (contains var() references)
  if (property === "unparsed") {
    handleUnparsed(
      value as Record<string, unknown>,
      props,
      acc,
      warnings,
      tokens
    );
    return;
  }

  // Handle custom properties (:root variables handled elsewhere)
  if (property === "custom") {
    handleCustomProperty(
      value as Record<string, unknown>,
      props,
      acc,
      warnings
    );
    return;
  }

  switch (property) {
    case "background-color": {
      const result = convertCssColor(value);
      if (result) {
        props.set("BackgroundColor3", {
          type: "Color3",
          value: result.color,
        });
        if (result.transparency !== undefined) {
          props.set("BackgroundTransparency", {
            type: "number",
            value: result.transparency,
          });
        }
      }
      break;
    }

    case "background": {
      handleBackground(value, props, acc, warnings);
      break;
    }

    case "color": {
      const result = convertCssColor(value);
      if (result) {
        props.set("TextColor3", { type: "Color3", value: result.color });
        if (result.transparency !== undefined) {
          props.set("TextTransparency", {
            type: "number",
            value: result.transparency,
          });
        }
      }
      break;
    }

    case "opacity": {
      const opacity = value as number;
      // opacity: 1 is the CSS default — skip it to avoid overwriting
      // BackgroundTransparency set by background-color (e.g. transparent)
      if (opacity !== 1) {
        props.set("BackgroundTransparency", {
          type: "number",
          value: 1 - opacity,
        });
      }
      break;
    }

    case "width": {
      acc.widthX = handleSize(value, warnings);
      break;
    }

    case "height": {
      acc.heightY = handleSize(value, warnings);
      break;
    }

    case "left": {
      const v = value as Record<string, unknown>;
      if (v.type === "length-percentage") {
        const result = convertLengthDimension(v.value, warnings);
        if (result && result !== "auto") acc.leftX = result;
      }
      break;
    }

    case "top": {
      const v = value as Record<string, unknown>;
      if (v.type === "length-percentage") {
        const result = convertLengthDimension(v.value, warnings);
        if (result && result !== "auto") acc.topY = result;
      }
      break;
    }

    case "display": {
      handleDisplay(value, props, acc);
      break;
    }

    case "flex-direction": {
      acc.flexDirection = value as string;
      break;
    }

    case "justify-content": {
      const v = value as Record<string, unknown>;
      // lightningcss may represent this differently
      acc.justifyContent = extractContentAlignment(v);
      break;
    }

    case "align-items": {
      const v = value as Record<string, unknown>;
      acc.alignItems = extractItemsAlignment(v);
      break;
    }

    case "gap": {
      const v = value as Record<string, unknown>;
      const row = v.row as Record<string, unknown>;
      const column = v.column as Record<string, unknown>;
      if (row?.type === "length-percentage") {
        const result = convertLengthDimension(
          row.value as Record<string, unknown>,
          warnings
        );
        if (result && result !== "auto") {
          acc.gap = toUDim(result);
          acc.gridGapY = toUDim(result);
        }
      }
      if (column?.type === "length-percentage") {
        const result = convertLengthDimension(
          column.value as Record<string, unknown>,
          warnings
        );
        if (result && result !== "auto") {
          acc.gridGapX = toUDim(result);
        }
      } else if (acc.gridGapY) {
        // If only row gap specified, use same for column
        acc.gridGapX = acc.gridGapY;
      }
      break;
    }

    case "flex-wrap": {
      const v = value as string;
      acc.flexWrap = v === "wrap" || v === "wrap-reverse";
      break;
    }

    case "flex-grow": {
      acc.flexGrow = value as number;
      break;
    }

    case "flex-shrink": {
      acc.flexShrink = value as number;
      break;
    }

    case "padding": {
      handlePadding(value as Record<string, unknown>, acc, warnings);
      break;
    }

    case "padding-top":
    case "padding-bottom":
    case "padding-left":
    case "padding-right": {
      handlePaddingSide(property, value, acc, warnings);
      break;
    }

    case "padding-inline": {
      // Logical property: left + right (LTR assumed for Roblox)
      // Value is {inlineStart: {type, value}, inlineEnd: {type, value}}
      const pi = value as Record<string, unknown>;
      handlePaddingSide("padding-left", pi.inlineStart, acc, warnings);
      handlePaddingSide("padding-right", pi.inlineEnd, acc, warnings);
      break;
    }

    case "padding-block": {
      // Logical property: top + bottom
      // Value is {blockStart: {type, value}, blockEnd: {type, value}}
      const pb = value as Record<string, unknown>;
      handlePaddingSide("padding-top", pb.blockStart, acc, warnings);
      handlePaddingSide("padding-bottom", pb.blockEnd, acc, warnings);
      break;
    }

    case "padding-inline-start":
    case "padding-inline-end": {
      // Map logical to physical: start→left, end→right (LTR)
      const physicalProp =
        property === "padding-inline-start" ? "padding-left" : "padding-right";
      handlePaddingSide(physicalProp, value, acc, warnings);
      break;
    }

    case "padding-block-start":
    case "padding-block-end": {
      // Map logical to physical: start→top, end→bottom
      const physicalProp =
        property === "padding-block-start" ? "padding-top" : "padding-bottom";
      handlePaddingSide(physicalProp, value, acc, warnings);
      break;
    }

    case "border": {
      handleBorder(value as Record<string, unknown>, acc, warnings);
      break;
    }

    case "border-top":
    case "border-right":
    case "border-bottom":
    case "border-left": {
      // Treat as border shorthand (Roblox only has uniform borders via UIStroke)
      handleBorder(value as Record<string, unknown>, acc, warnings);
      break;
    }

    case "border-radius": {
      handleBorderRadius(value as Record<string, unknown>, acc, warnings);
      break;
    }

    case "border-color": {
      // lightningcss gives {top: color, right: color, ...} for border-color shorthand
      const v = value as Record<string, unknown>;
      const colorVal = v.top ?? value;
      const result = convertCssColor(colorVal);
      if (result) acc.borderColor = result.color;
      break;
    }

    case "border-width": {
      const v = value as Record<string, unknown>;
      // border-width is a shorthand with top/right/bottom/left
      const top = v.top as Record<string, unknown> | undefined;
      if (top?.type === "length") {
        const inner = top.value as Record<string, unknown>;
        if (inner?.type === "value") {
          const dim = inner.value as Record<string, unknown>;
          acc.borderWidth = dim.value as number;
        }
      }
      break;
    }

    case "border-style": {
      const v = value as Record<string, unknown>;
      acc.borderStyle = (v.top as string) ?? "solid";
      break;
    }

    case "font-size": {
      const v = value as Record<string, unknown>;
      if (v.type === "length") {
        const inner = v.value as Record<string, unknown>;
        if (inner.type === "dimension") {
          const dim = inner.value as Record<string, unknown>;
          if (dim.unit === "px") {
            props.set("TextSize", {
              type: "number",
              value: dim.value as number,
            });
          } else if (dim.unit === "rem" || dim.unit === "em") {
            props.set("TextSize", {
              type: "number",
              value: (dim.value as number) * 16,
            });
          }
        }
      }
      break;
    }

    case "font-family": {
      const families = value as string[];
      acc.fontFamily = mapFontFamily(families, warnings);
      break;
    }

    case "font-weight": {
      const v = value as Record<string, unknown>;
      if (v.type === "absolute") {
        const abs = v.value as Record<string, unknown>;
        acc.fontWeight = mapFontWeight(abs.value as number);
      } else if (v.type === "bolder" || v.type === "lighter") {
        acc.fontWeight = mapFontWeight(v.type);
      }
      break;
    }

    case "font-style": {
      // lightningcss gives {type: "italic"} or {type: "normal"} or string
      if (typeof value === "string") {
        acc.fontStyle = mapFontStyle(value);
      } else {
        const v = value as Record<string, unknown>;
        acc.fontStyle = mapFontStyle(v.type as string);
      }
      break;
    }

    case "text-align": {
      const v = value as string;
      props.set("TextXAlignment", mapTextXAlignment(v));
      break;
    }

    case "vertical-align": {
      const v = value as Record<string, unknown>;
      const align =
        typeof v === "string"
          ? v
          : v.type === "keyword"
          ? (v.value as string)
          : "top";
      props.set("TextYAlignment", mapTextYAlignment(align));
      break;
    }

    case "z-index": {
      const v = value as Record<string, unknown>;
      if (v.type === "integer") {
        props.set("ZIndex", { type: "number", value: v.value as number });
      }
      break;
    }

    case "overflow": {
      const v = value as Record<string, unknown>;
      applyOverflow(v.x as string, v.y as string, props, acc, warnings);
      break;
    }

    case "overflow-x": {
      applyOverflow(value as string, undefined, props, acc, warnings);
      break;
    }

    case "overflow-y": {
      applyOverflow(undefined, value as string, props, acc, warnings);
      break;
    }


    case "visibility": {
      if (value === "hidden") {
        props.set("Visible", { type: "boolean", value: false });
      }
      break;
    }

    case "background-image": {
      const imgs = value as unknown[];
      if (imgs?.length > 0) {
        const img = imgs[0] as Record<string, unknown>;
        if (img.type === "url") {
          const urlVal = img.value as Record<string, unknown>;
          props.set("Image", {
            type: "string",
            value: urlVal.url as string,
          });
        }
      }
      break;
    }

    case "object-fit": {
      handleObjectFit(value as string, props);
      break;
    }

    case "aspect-ratio": {
      const v = value as Record<string, unknown>;
      const ratio = v.ratio as [number, number] | undefined;
      if (ratio) {
        acc.aspectRatio = ratio[0] / ratio[1];
      }
      break;
    }

    case "line-height": {
      const v = value as Record<string, unknown>;
      if (v.type === "number") {
        props.set("LineHeight", {
          type: "number",
          value: v.value as number,
        });
      }
      break;
    }

    case "word-wrap":
    case "overflow-wrap": {
      if (value === "break-word") {
        props.set("TextWrapped", { type: "boolean", value: true });
      }
      break;
    }

    case "text-overflow": {
      if (value === "ellipsis") {
        props.set("TextTruncate", {
          type: "Enum",
          enum: "TextTruncate",
          value: "AtEnd",
        });
      }
      break;
    }

    case "min-width": {
      const px = extractPxFromLengthPercentage(value, warnings);
      if (px !== null) acc.minWidth = px;
      break;
    }

    case "max-width": {
      const px = extractPxFromLengthPercentage(value, warnings);
      if (px !== null) acc.maxWidth = px;
      break;
    }

    case "min-height": {
      const px = extractPxFromLengthPercentage(value, warnings);
      if (px !== null) acc.minHeight = px;
      break;
    }

    case "max-height": {
      const px = extractPxFromLengthPercentage(value, warnings);
      if (px !== null) acc.maxHeight = px;
      break;
    }

    case "transform-origin": {
      handleTransformOrigin(value as Record<string, unknown>, props);
      break;
    }

    case "position":
    case "cursor":
      // Silently ignored
      break;

    case "outline": {
      handleOutline(value as Record<string, unknown>, acc, warnings);
      break;
    }

    case "transform": {
      handleTransform(value as unknown[], acc, warnings);
      break;
    }

    case "order": {
      const v = value as number;
      if (typeof v === "number") {
        props.set("LayoutOrder", { type: "number", value: v });
      }
      break;
    }

    case "align-self": {
      const v = value as Record<string, unknown>;
      acc.alignSelf = extractItemsAlignment(v);
      break;
    }

    case "flex-basis": {
      const v = value as Record<string, unknown>;
      if (v.type === "length-percentage") {
        const result = convertLengthDimension(v.value, warnings);
        if (result && result !== "auto") {
          acc.flexBasis = result;
        }
      }
      break;
    }

    case "grid-template-columns": {
      acc.hasGrid = true;
      handleGridTemplateColumns(value, acc, warnings);
      break;
    }

    case "grid-template-rows": {
      acc.hasGrid = true;
      handleGridTemplateRows(value, acc, warnings);
      break;
    }

    case "margin":
    case "margin-top":
    case "margin-right":
    case "margin-bottom":
    case "margin-left":
    case "margin-block":
    case "margin-inline":
      // Roblox has no margin concept - use gap on parent UIListLayout instead
      warnings.warn({
        code: "unsupported-property",
        message: `'${property}' has no Roblox equivalent (use 'gap' on parent flex container instead) - skipped`,
      });
      break;

    default:
      warnings.warn({
        code: "unsupported-property",
        message: `'${property}' has no Roblox equivalent - skipped`,
      });
  }
}

function handleDisplay(
  value: unknown,
  props: Map<string, RobloxValue>,
  acc: Accumulator
): void {
  const v = value as Record<string, unknown>;

  if (v.type === "keyword" && v.value === "none") {
    props.set("Visible", { type: "boolean", value: false });
    return;
  }

  if (v.type === "pair") {
    const inside = v.inside as Record<string, unknown>;
    if (inside?.type === "flex") {
      acc.hasFlex = true;
    } else if (inside?.type === "grid") {
      acc.hasGrid = true;
    }
  }
}

function handleSize(
  value: unknown,
  warnings: WarningCollector
): UDimResult | "auto" | undefined {
  const v = value as Record<string, unknown>;

  if (v.type === "auto") return "auto";

  if (v.type === "length-percentage") {
    const result = convertLengthDimension(v.value, warnings);
    if (result) return result;
  }

  return undefined;
}

function handlePadding(
  value: Record<string, unknown>,
  acc: Accumulator,
  warnings: WarningCollector
): void {
  for (const [side, key] of [
    ["top", "paddingTop"],
    ["right", "paddingRight"],
    ["bottom", "paddingBottom"],
    ["left", "paddingLeft"],
  ] as const) {
    const sideVal = value[side] as Record<string, unknown> | undefined;
    if (sideVal?.type === "length-percentage") {
      const result = convertLengthDimension(sideVal.value, warnings);
      if (result && result !== "auto") {
        acc[key] = toUDim(result);
      }
    }
  }
}

function handlePaddingSide(
  property: string,
  value: unknown,
  acc: Accumulator,
  warnings: WarningCollector
): void {
  const v = value as Record<string, unknown>;
  if (v.type === "length-percentage") {
    const result = convertLengthDimension(v.value, warnings);
    if (result && result !== "auto") {
      const udim = toUDim(result);
      switch (property) {
        case "padding-top":
          acc.paddingTop = udim;
          break;
        case "padding-bottom":
          acc.paddingBottom = udim;
          break;
        case "padding-left":
          acc.paddingLeft = udim;
          break;
        case "padding-right":
          acc.paddingRight = udim;
          break;
      }
    }
  }
}

function handleBorder(
  value: Record<string, unknown>,
  acc: Accumulator,
  warnings: WarningCollector
): void {
  // Width
  const width = value.width as Record<string, unknown> | undefined;
  if (width?.type === "length") {
    const inner = width.value as Record<string, unknown>;
    if (inner?.type === "value") {
      const dim = inner.value as Record<string, unknown>;
      acc.borderWidth = dim.value as number;
    }
  }

  // Style
  const style = value.style as string | undefined;
  acc.borderStyle = style ?? "solid";
  if (style === "dashed" || style === "dotted") {
    warnings.warn({
      code: "partial-mapping",
      message: `border-style '${style}' not supported in Roblox, using solid`,
    });
  }

  // Color
  const color = convertCssColor(value.color);
  if (color) {
    acc.borderColor = color.color;
    if (color.transparency !== undefined) {
      acc.borderTransparency = color.transparency;
    }
  }
}

function handleBorderRadius(
  value: Record<string, unknown>,
  acc: Accumulator,
  warnings: WarningCollector
): void {
  // lightningcss gives us topLeft, topRight, bottomRight, bottomLeft
  // Each is an array of two dimensions (horizontal, vertical)
  const topLeft = value.topLeft as unknown[] | undefined;
  if (!topLeft?.[0]) return;

  const first = topLeft[0] as Record<string, unknown>;

  // Check if all corners are the same
  const allSame = ["topLeft", "topRight", "bottomRight", "bottomLeft"].every(
    (corner) => {
      const c = value[corner] as unknown[] | undefined;
      if (!c?.[0]) return false;
      const dim = c[0] as Record<string, unknown>;
      return (
        dim.type === first.type &&
        JSON.stringify(dim.value) === JSON.stringify(first.value)
      );
    }
  );

  if (!allSame) {
    warnings.warn({
      code: "partial-mapping",
      message:
        "Per-corner border-radius not supported in Roblox, using first value",
    });
  }

  if (first.type === "dimension") {
    const dim = first.value as Record<string, unknown>;
    if (dim.unit === "px") {
      acc.borderRadius = {
        type: "UDim",
        value: [0, dim.value as number],
      };
    } else if (dim.unit === "rem" || dim.unit === "em") {
      acc.borderRadius = {
        type: "UDim",
        value: [0, (dim.value as number) * 16],
      };
    }
  } else if (first.type === "percentage") {
    // lightningcss gives percentages as 0-1 (e.g. 50% = 0.5)
    acc.borderRadius = {
      type: "UDim",
      value: [first.value as number, 0],
    };
  }
}

function handleBackground(
  value: unknown,
  props: Map<string, RobloxValue>,
  acc: Accumulator,
  warnings: WarningCollector
): void {
  const layers = value as Record<string, unknown>[];
  if (!Array.isArray(layers) || layers.length === 0) return;

  const layer = layers[0]!;
  const image = layer.image as Record<string, unknown> | undefined;

  if (image?.type === "gradient") {
    const gradient = image.value as Record<string, unknown>;
    if (gradient.type === "linear") {
      handleLinearGradient(gradient, acc, warnings);
    } else {
      warnings.warn({
        code: "unsupported-property",
        message: `'${gradient.type}-gradient' not supported, only linear-gradient`,
      });
    }
    return;
  }

  // Check for solid color
  const color = layer.color as Record<string, unknown> | undefined;
  if (color) {
    const result = convertCssColor(color);
    if (
      result &&
      result.color[0] === 0 &&
      result.color[1] === 0 &&
      result.color[2] === 0 &&
      result.transparency === 1
    ) {
      // background: transparent
      props.set("BackgroundTransparency", { type: "number", value: 1 });
    } else if (result) {
      props.set("BackgroundColor3", { type: "Color3", value: result.color });
      if (result.transparency !== undefined) {
        props.set("BackgroundTransparency", {
          type: "number",
          value: result.transparency,
        });
      }
    }
  }
}

function handleLinearGradient(
  gradient: Record<string, unknown>,
  acc: Accumulator,
  _warnings: WarningCollector
): void {
  // Direction
  const direction = gradient.direction as Record<string, unknown> | undefined;
  if (direction?.type === "angle") {
    const angle = direction.value as Record<string, unknown>;
    acc.gradientRotation = angle.value as number;
  }

  // Color stops
  const items = gradient.items as Record<string, unknown>[] | undefined;
  if (items) {
    acc.gradientStops = [];
    let autoIndex = 0;
    const colorStops = items.filter((i) => i.type === "color-stop");
    const stopCount = colorStops.length;

    for (const item of colorStops) {
      if (item.type === "color-stop") {
        const colorResult = convertCssColor(item.color);
        if (colorResult) {
          const position =
            item.position !== null
              ? extractGradientPosition(
                  item.position as Record<string, unknown>
                )
              : autoIndex / Math.max(stopCount - 1, 1);
          acc.gradientStops.push({
            position,
            color: colorResult.color,
          });
        }
        autoIndex++;
      }
    }
  }
}

function extractGradientPosition(pos: Record<string, unknown>): number {
  // lightningcss gives percentages as 0-1 (e.g. 100% = 1)
  if (pos.type === "percentage") return pos.value as number;
  return 0;
}

function handleObjectFit(value: string, props: Map<string, RobloxValue>): void {
  switch (value) {
    case "cover":
      props.set("ScaleType", {
        type: "Enum",
        enum: "ScaleType",
        value: "Crop",
      });
      break;
    case "contain":
      props.set("ScaleType", {
        type: "Enum",
        enum: "ScaleType",
        value: "Fit",
      });
      break;
    case "fill":
      props.set("ScaleType", {
        type: "Enum",
        enum: "ScaleType",
        value: "Stretch",
      });
      break;
  }
}

function handleTransformOrigin(
  value: Record<string, unknown>,
  props: Map<string, RobloxValue>
): void {
  const x = resolveAnchorAxis(value.x as Record<string, unknown>);
  const y = resolveAnchorAxis(value.y as Record<string, unknown>);
  if (x !== null && y !== null) {
    props.set("AnchorPoint", { type: "Vector2", value: [x, y] });
  }
}

function resolveAnchorAxis(axis: Record<string, unknown>): number | null {
  if (!axis) return null;
  if (axis.type === "center") return 0.5;
  if (axis.type === "left" || axis.type === "top") return 0;
  if (axis.type === "right" || axis.type === "bottom") return 1;
  if (axis.type === "side") {
    const side = axis.side as string;
    if (side === "left" || side === "top") return 0;
    if (side === "right" || side === "bottom") return 1;
  }
  if (axis.type === "length") {
    const v = axis.value as Record<string, unknown>;
    if (v.type === "percentage") return (v.value as number) / 100;
  }
  return null;
}

function handleOutline(
  value: Record<string, unknown>,
  acc: Accumulator,
  warnings: WarningCollector
): void {
  // outline maps to UIStroke with ApplyStrokeMode = Contextual
  handleBorder(value, acc, warnings);
  // Override the mode to Contextual for outline
  acc.borderStyle = "outline";
}

/**
 * Map one or both overflow axes.
 *
 * The axes arrive either together (the `overflow` shorthand) or one at a time,
 * so a scrollable axis is unioned with whatever an earlier declaration set
 * rather than replacing it.
 */
function applyOverflow(
  x: string | undefined,
  y: string | undefined,
  props: Map<string, RobloxValue>,
  acc: Accumulator,
  warnings: WarningCollector
): void {
  if (x === "hidden" || y === "hidden") {
    props.set("ClipsDescendants", { type: "boolean", value: true });
  }

  const scrollsX = x === "scroll" || x === "auto";
  const scrollsY = y === "scroll" || y === "auto";
  if (!scrollsX && !scrollsY) return;

  acc.overflowScroll = true;

  // A ScrollingFrame defaults to a canvas twice its own height and never grows
  // it, so content past that is unreachable while shorter content scrolls into
  // empty space. A browser derives the scrollable area from the content, which
  // is what AutomaticCanvasSize does.
  props.set("CanvasSize", { type: "UDim2", value: [0, 0, 0, 0] });

  const existing = props.get("AutomaticCanvasSize");
  const already = existing?.type === "Enum" ? existing.value : "";
  const axisX = scrollsX || already === "X" || already === "XY";
  const axisY = scrollsY || already === "Y" || already === "XY";
  props.set("AutomaticCanvasSize", {
    type: "Enum",
    enum: "AutomaticSize",
    value: axisX && axisY ? "XY" : axisX ? "X" : "Y",
  });

  warnings.warn({
    code: "partial-mapping",
    message:
      "overflow: scroll detected — will trigger ScrollingFrame upgrade via manifest",
  });
}

function handleCustomProperty(
  value: Record<string, unknown>,
  props: Map<string, RobloxValue>,
  acc: Accumulator,
  warnings: WarningCollector
): void {
  // lightningcss treats some unknown properties as custom
  const name = value.name as string;
  const tokens = value.value as unknown[];

  if (name === "object-fit" && tokens?.[0]) {
    const tok = tokens[0] as Record<string, unknown>;
    if (tok.type === "token") {
      const tokenVal = tok.value as Record<string, unknown>;
      if (tokenVal.type === "ident") {
        handleObjectFit(tokenVal.value as string, props);
      }
    }
    return;
  }

  // Roblox has no scrollbar that shows only while scrolling, so `auto` keeps
  // the platform's own thickness.
  if (name === "scrollbar-width" && tokens?.[0]) {
    const tok = tokens[0] as Record<string, unknown>;
    const tokenVal = tok.value as Record<string, unknown> | undefined;
    if (tok.type === "token" && tokenVal?.type === "ident") {
      const thickness: Record<string, number> = { none: 0, thin: 6, auto: 12 };
      const width = thickness[tokenVal.value as string];
      if (width !== undefined) {
        props.set("ScrollBarThickness", { type: "number", value: width });
      }
    }
    return;
  }

  // Unknown custom property, skip
}

function handleUnparsed(
  unparsed: Record<string, unknown>,
  props: Map<string, RobloxValue>,
  acc: Accumulator,
  warnings: WarningCollector,
  sheetTokens?: Map<string, TokenValue>
): void {
  const propertyId = unparsed.propertyId as Record<string, unknown>;
  const propName = propertyId.property as string;
  const tokens = unparsed.value as unknown[];

  // Skip properties that have no Roblox equivalent anyway
  if (IGNORED_CSS_PROPERTIES.has(propName)) return;

  const varRef = extractVarReference(tokens);
  if (!varRef) {
    // Non-var() unparsed values (inherit, currentColor, etc.) are silently
    // skipped — they typically come from browser resets and have no Roblox
    // meaning.
    return;
  }

  // A border shorthand carries its width alongside the reference, and only the
  // whole token list has it. Everything else is a single value.
  if (BORDER_SHORTHANDS.has(propName)) {
    handleUnparsedBorder(tokens, varRef, acc);
    return;
  }

  mapTokenReference(propName, varRef, props, acc, warnings, sheetTokens);
}

const BORDER_SHORTHANDS = new Set([
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
]);

/**
 * Map a border shorthand whose colour is a token reference.
 *
 * lightningcss cannot parse such a declaration, so it arrives as a raw token
 * list; without this the whole border is dropped and the element renders with
 * no stroke at all.
 */
function handleUnparsedBorder(
  tokens: unknown[],
  varRef: string,
  acc: Accumulator
): void {
  acc.borderColorToken = { type: "token", name: varRef };

  for (const tok of tokens) {
    const t = tok as Record<string, unknown>;
    if (t.type === "length") {
      const len = t.value as Record<string, unknown>;
      if (len.unit === "px") acc.borderWidth = len.value as number;
      continue;
    }
    if (t.type !== "token") continue;
    const inner = t.value as Record<string, unknown>;
    if (inner.type === "ident") acc.borderStyle = inner.value as string;
  }

  // `border: <color>` alone is a 3px border in CSS terms, but Roblox needs a
  // thickness before it draws anything.
  if (acc.borderWidth === undefined) acc.borderWidth = 1;
}

function extractVarReference(tokens: unknown[]): string | null {
  for (const tok of tokens) {
    const t = tok as Record<string, unknown>;
    if (t.type === "var") {
      const val = t.value as Record<string, unknown>;
      const name = val.name as Record<string, unknown>;
      const ident = name.ident as string;
      return ident.replace(/^--/, "");
    }
  }
  return null;
}

/**
 * Resolve a length token to its scale/offset pair.
 *
 * Needed wherever a token has to become one component of a composite value:
 * the reference form only resolves as a whole property value, so a composite
 * built from a `$token` string fails to cast and the property is dropped.
 */
function resolveLengthToken(
  tokenName: string,
  sheetTokens?: Map<string, TokenValue>
): UDimResult | null {
  const token = sheetTokens?.get(tokenName);
  if (!token) return null;
  if (token.type === "UDim") {
    return { scale: token.value[0], offset: token.value[1] };
  }
  if (token.type === "number") {
    return { scale: 0, offset: token.value };
  }
  return null;
}

function mapTokenReference(
  cssProperty: string,
  tokenName: string,
  props: Map<string, RobloxValue>,
  acc: Accumulator,
  warnings: WarningCollector,
  sheetTokens?: Map<string, TokenValue>
): void {
  const tokenRef: RobloxValue = { type: "token", name: tokenName };

  switch (cssProperty) {
    case "background-color":
      props.set("BackgroundColor3", tokenRef);
      // Token colors are assumed opaque — ensure background is visible
      props.set("BackgroundTransparency", { type: "number", value: 0 });
      break;
    case "color":
      props.set("TextColor3", tokenRef);
      break;
    case "border-radius":
      acc.borderRadius = tokenRef;
      break;
    case "border-color":
      acc.borderColorToken = tokenRef;
      break;
    case "padding":
      acc.paddingTop = tokenRef;
      acc.paddingBottom = tokenRef;
      acc.paddingLeft = tokenRef;
      acc.paddingRight = tokenRef;
      break;
    case "padding-top":
      acc.paddingTop = tokenRef;
      break;
    case "padding-bottom":
      acc.paddingBottom = tokenRef;
      break;
    case "padding-left":
      acc.paddingLeft = tokenRef;
      break;
    case "padding-right":
      acc.paddingRight = tokenRef;
      break;
    case "gap":
      acc.gap = tokenRef;
      break;
    case "width":
    case "height": {
      // Size is one UDim2 built from both axes, so the token cannot be left as
      // a reference: it is resolved here and folded into the composite. The
      // earlier behaviour assigned the reference straight to Size, which casts
      // a UDim to a UDim2 at runtime and leaves the element with no size.
      const resolved = resolveLengthToken(tokenName, sheetTokens);
      if (!resolved) {
        warnings.warn({
          code: "type-inference-ambiguous",
          message:
            `'${cssProperty}: var(--${tokenName})' needs a length token to ` +
            `fold into Size; '--${tokenName}' is not one, so the ` +
            `${cssProperty} was dropped`,
        });
        break;
      }
      if (cssProperty === "width") acc.widthX = resolved;
      else acc.heightY = resolved;
      break;
    }
    case "font-size":
      props.set("TextSize", tokenRef);
      break;
    case "font-family":
      props.set("FontFace", tokenRef);
      break;
    case "opacity":
      props.set("BackgroundTransparency", tokenRef);
      break;
    default:
      break;
  }
}

function mapTextXAlignment(value: string): RobloxValue {
  switch (value) {
    case "left":
      return { type: "Enum", enum: "TextXAlignment", value: "Left" };
    case "center":
      return { type: "Enum", enum: "TextXAlignment", value: "Center" };
    case "right":
      return { type: "Enum", enum: "TextXAlignment", value: "Right" };
    default:
      return { type: "Enum", enum: "TextXAlignment", value: "Left" };
  }
}

function mapTextYAlignment(value: string): RobloxValue {
  switch (value) {
    case "top":
      return { type: "Enum", enum: "TextYAlignment", value: "Top" };
    case "center":
    case "middle":
      return { type: "Enum", enum: "TextYAlignment", value: "Center" };
    case "bottom":
      return { type: "Enum", enum: "TextYAlignment", value: "Bottom" };
    default:
      return { type: "Enum", enum: "TextYAlignment", value: "Top" };
  }
}

function extractPxFromLengthPercentage(
  value: unknown,
  warnings: WarningCollector
): number | null {
  const v = value as Record<string, unknown>;
  if (v.type === "length-percentage") {
    const inner = v.value as Record<string, unknown>;
    if (inner.type === "dimension") {
      const dim = inner.value as Record<string, unknown>;
      if (dim.unit === "px") return dim.value as number;
      if (dim.unit === "rem" || dim.unit === "em")
        return (dim.value as number) * 16;
    }
  }
  return null;
}

function extractContentAlignment(v: Record<string, unknown>): string {
  // lightningcss represents justify-content with various structures
  if (typeof v === "string") return v;
  if (v.type === "normal") return "flex-start";
  if (v.type === "content-distribution") return v.value as string;
  if (v.type === "content-position") {
    return v.value as string;
  }
  return "flex-start";
}

function extractItemsAlignment(v: Record<string, unknown>): string {
  if (typeof v === "string") return v;
  if (v.type === "normal") return "stretch";
  if (v.type === "self-position") return v.value as string;
  if (v.type === "keyword") return v.value as string;
  return "stretch";
}

function handleTransform(
  transforms: unknown[],
  acc: Accumulator,
  warnings: WarningCollector
): void {
  if (!Array.isArray(transforms)) return;
  for (const t of transforms) {
    const tf = t as Record<string, unknown>;
    switch (tf.type) {
      case "scale": {
        const vals = tf.value as Array<Record<string, unknown>>;
        if (vals && vals.length >= 1) {
          const x = vals[0]!.value as number;
          const y = vals.length >= 2 ? (vals[1]!.value as number) : x;
          // Use average for uniform UIScale (Roblox UIScale is uniform)
          acc.scale = x === y ? x : (x + y) / 2;
        }
        break;
      }
      case "scaleX":
      case "scaleY": {
        const v = tf.value as Record<string, unknown>;
        acc.scale = v.value as number;
        break;
      }
      case "rotate": {
        const v = tf.value as Record<string, unknown>;
        if (v.type === "deg") {
          acc.rotation = v.value as number;
        } else if (v.type === "rad") {
          acc.rotation = (v.value as number) * (180 / Math.PI);
        } else if (v.type === "turn") {
          acc.rotation = (v.value as number) * 360;
        }
        break;
      }
      default:
        warnings.warn({
          code: "unsupported-property",
          message: `transform function '${tf.type}' has no Roblox equivalent - skipped`,
        });
    }
  }
}

function extractTrackSize(
  trackBreadth: Record<string, unknown>,
  warnings: WarningCollector
): UDimResult | null {
  // track-breadth -> length -> dimension
  if (trackBreadth.type === "length") {
    const dim = trackBreadth.value as Record<string, unknown>;
    if (dim.type === "dimension") {
      const val = dim.value as Record<string, unknown>;
      const unit = val.unit as string;
      const value = val.value as number;
      switch (unit) {
        case "px":
          return { scale: 0, offset: value };
        case "rem":
          return { scale: 0, offset: value * 16 };
        default:
          return null;
      }
    }
  }
  // flex (1fr) - no fixed size, skip
  return null;
}

function handleGridTemplateColumns(
  value: unknown,
  acc: Accumulator,
  warnings: WarningCollector
): void {
  const v = value as Record<string, unknown>;
  if (v.type !== "track-list") return;

  const items = v.items as unknown[];
  if (!Array.isArray(items)) return;

  for (const item of items) {
    const t = item as Record<string, unknown>;
    if (t.type === "track-repeat") {
      // repeat(N, size) pattern
      const repeat = t.value as Record<string, unknown>;
      const count = repeat?.count as Record<string, unknown>;
      if (count?.type === "number") {
        acc.gridMaxCellsPerRow = count.value as number;
      }
      const trackSizes = repeat?.trackSizes as unknown[];
      if (trackSizes && trackSizes.length > 0) {
        const first = trackSizes[0] as Record<string, unknown>;
        if (first.type === "track-breadth") {
          const size = extractTrackSize(
            first.value as Record<string, unknown>,
            warnings
          );
          if (size) acc.gridCellWidth = size;
        }
      }
    } else if (t.type === "track-size") {
      // Explicit column size - count them for FillDirectionMaxCells
      if (!acc.gridMaxCellsPerRow) acc.gridMaxCellsPerRow = 0;
      acc.gridMaxCellsPerRow++;
      if (acc.gridMaxCellsPerRow === 1) {
        const breadth = t.value as Record<string, unknown>;
        if (breadth.type === "track-breadth") {
          const size = extractTrackSize(
            breadth.value as Record<string, unknown>,
            warnings
          );
          if (size) acc.gridCellWidth = size;
        }
      }
    }
  }
}

function handleGridTemplateRows(
  value: unknown,
  acc: Accumulator,
  warnings: WarningCollector
): void {
  const v = value as Record<string, unknown>;
  if (v.type !== "track-list") return;

  const items = v.items as unknown[];
  if (!Array.isArray(items)) return;

  for (const item of items) {
    const t = item as Record<string, unknown>;
    if (t.type === "track-repeat") {
      const repeat = t.value as Record<string, unknown>;
      const trackSizes = repeat?.trackSizes as unknown[];
      if (trackSizes && trackSizes.length > 0) {
        const first = trackSizes[0] as Record<string, unknown>;
        if (first.type === "track-breadth") {
          const size = extractTrackSize(
            first.value as Record<string, unknown>,
            warnings
          );
          if (size) acc.gridCellHeight = size;
        }
      }
    } else if (t.type === "track-size") {
      const breadth = t.value as Record<string, unknown>;
      if (breadth.type === "track-breadth") {
        const size = extractTrackSize(
          breadth.value as Record<string, unknown>,
          warnings
        );
        if (size) {
          acc.gridCellHeight = size;
          break; // Only need first row height for uniform grid
        }
      }
    }
  }
}

function mapFillDirection(direction: string): RobloxValue {
  if (direction === "row" || direction === "row-reverse") {
    return { type: "Enum", enum: "FillDirection", value: "Horizontal" };
  }
  return { type: "Enum", enum: "FillDirection", value: "Vertical" };
}

function mapJustifyContent(
  justifyContent: string,
  flexDirection?: string
): { prop: string; value: RobloxValue } | null {
  const isHorizontal =
    !flexDirection ||
    flexDirection === "row" ||
    flexDirection === "row-reverse";

  const prop = isHorizontal ? "HorizontalAlignment" : "VerticalAlignment";
  const enumName = isHorizontal ? "HorizontalAlignment" : "VerticalAlignment";

  switch (justifyContent) {
    case "flex-start":
    case "start":
      return {
        prop,
        value: {
          type: "Enum",
          enum: enumName,
          value: isHorizontal ? "Left" : "Top",
        },
      };
    case "center":
      return {
        prop,
        value: { type: "Enum", enum: enumName, value: "Center" },
      };
    case "flex-end":
    case "end":
      return {
        prop,
        value: {
          type: "Enum",
          enum: enumName,
          value: isHorizontal ? "Right" : "Bottom",
        },
      };
    case "space-between":
      return {
        prop: isHorizontal ? "HorizontalFlex" : "VerticalFlex",
        value: { type: "Enum", enum: "UIFlexAlignment", value: "SpaceBetween" },
      };
    case "space-around":
      return {
        prop: isHorizontal ? "HorizontalFlex" : "VerticalFlex",
        value: { type: "Enum", enum: "UIFlexAlignment", value: "SpaceAround" },
      };
    case "space-evenly":
      return {
        prop: isHorizontal ? "HorizontalFlex" : "VerticalFlex",
        value: { type: "Enum", enum: "UIFlexAlignment", value: "SpaceEvenly" },
      };
    default:
      return null;
  }
}

function mapAlignItems(
  alignItems: string,
  flexDirection?: string
): { prop: string; value: RobloxValue } | null {
  const isHorizontal =
    !flexDirection ||
    flexDirection === "row" ||
    flexDirection === "row-reverse";

  // Cross-axis is opposite
  const prop = isHorizontal ? "VerticalAlignment" : "HorizontalAlignment";
  const enumName = isHorizontal ? "VerticalAlignment" : "HorizontalAlignment";

  switch (alignItems) {
    case "flex-start":
    case "start":
      return {
        prop,
        value: {
          type: "Enum",
          enum: enumName,
          value: isHorizontal ? "Top" : "Left",
        },
      };
    case "center":
      return {
        prop,
        value: { type: "Enum", enum: enumName, value: "Center" },
      };
    case "flex-end":
    case "end":
      return {
        prop,
        value: {
          type: "Enum",
          enum: enumName,
          value: isHorizontal ? "Bottom" : "Right",
        },
      };
    case "stretch":
      return {
        prop: "ItemLineAlignment",
        value: { type: "Enum", enum: "ItemLineAlignment", value: "Stretch" },
      };
    default:
      return null;
  }
}

function mapAlignSelf(alignSelf: string): RobloxValue | null {
  switch (alignSelf) {
    case "flex-start":
    case "start":
      return { type: "Enum", enum: "ItemLineAlignment", value: "Start" };
    case "center":
      return { type: "Enum", enum: "ItemLineAlignment", value: "Center" };
    case "flex-end":
    case "end":
      return { type: "Enum", enum: "ItemLineAlignment", value: "End" };
    case "stretch":
      return { type: "Enum", enum: "ItemLineAlignment", value: "Stretch" };
    default:
      return null;
  }
}

function finalizeAccumulator(
  acc: Accumulator,
  props: Map<string, RobloxValue>,
  warnings: WarningCollector
): PseudoInstanceIR[] {
  const pseudos: PseudoInstanceIR[] = [];

  // Flex basis -> Size in flex direction (must happen before Size finalization)
  // Note: flex-basis is set on the child, display:flex on the parent,
  // so we don't require hasFlex here. Default to width (row direction).
  if (acc.flexBasis) {
    const isRow =
      !acc.flexDirection ||
      acc.flexDirection === "row" ||
      acc.flexDirection === "row-reverse";
    if (isRow && acc.widthX === undefined) {
      acc.widthX = acc.flexBasis;
    } else if (!isRow && acc.heightY === undefined) {
      acc.heightY = acc.flexBasis;
    }
  }

  // Size (width + height -> UDim2 or AutomaticSize)
  if (acc.widthX !== undefined || acc.heightY !== undefined) {
    const xAuto = acc.widthX === "auto";
    const yAuto = acc.heightY === "auto";

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
      if (acc.heightY && acc.heightY !== "auto") {
        props.set("Size", {
          type: "UDim2",
          value: [0, 0, acc.heightY.scale, acc.heightY.offset],
        });
      }
    } else if (yAuto) {
      props.set("AutomaticSize", {
        type: "Enum",
        enum: "AutomaticSize",
        value: "Y",
      });
      if (acc.widthX && acc.widthX !== "auto") {
        props.set("Size", {
          type: "UDim2",
          value: [acc.widthX.scale, acc.widthX.offset, 0, 0],
        });
      }
    } else {
      const x: UDimResult = (acc.widthX as UDimResult) ?? {
        scale: 0,
        offset: 0,
      };
      const y: UDimResult = (acc.heightY as UDimResult) ?? {
        scale: 0,
        offset: 0,
      };
      props.set("Size", {
        type: "UDim2",
        value: [x.scale, x.offset, y.scale, y.offset],
      });
      // An explicit width and height wins over content sizing, as it does in
      // CSS. The element-type base rules give text and button instances
      // AutomaticSize so they behave like their HTML counterparts, and that
      // would otherwise keep overriding the size this rule just set.
      if (acc.widthX !== undefined && acc.heightY !== undefined) {
        props.set("AutomaticSize", {
          type: "Enum",
          enum: "AutomaticSize",
          value: "None",
        });
      } else {
        // Roblox carries both axes in one UDim2, so a rule naming only one of
        // them still writes the other, resetting it to zero. CSS would have
        // left it to the cascade.
        const missing = acc.widthX === undefined ? "height" : "width";
        const given = missing === "height" ? "width" : "height";
        warnings.warn({
          code: "partial-mapping",
          message: `'${given}' without '${missing}' sets Size on both axes, so ${missing} becomes 0; state both to keep it`,
        });
      }
    }
  }

  // Position (left + top -> UDim2)
  if (acc.leftX !== undefined || acc.topY !== undefined) {
    const x: UDimResult = acc.leftX ?? { scale: 0, offset: 0 };
    const y: UDimResult = acc.topY ?? { scale: 0, offset: 0 };
    props.set("Position", {
      type: "UDim2",
      value: [x.scale, x.offset, y.scale, y.offset],
    });
  }

  // Font (family + weight + style -> Font)
  if (acc.fontFamily) {
    props.set("FontFace", {
      type: "Font",
      family: acc.fontFamily,
      weight: acc.fontWeight,
      style: acc.fontStyle,
    });
  }

  // Padding -> ::UIPadding
  if (
    acc.paddingTop ||
    acc.paddingBottom ||
    acc.paddingLeft ||
    acc.paddingRight
  ) {
    const paddingProps = new Map<string, RobloxValue>();
    if (acc.paddingTop) paddingProps.set("PaddingTop", acc.paddingTop);
    if (acc.paddingBottom) paddingProps.set("PaddingBottom", acc.paddingBottom);
    if (acc.paddingLeft) paddingProps.set("PaddingLeft", acc.paddingLeft);
    if (acc.paddingRight) paddingProps.set("PaddingRight", acc.paddingRight);
    pseudos.push({ type: "UIPadding", properties: paddingProps });
  }

  // Border radius -> ::UICorner
  if (acc.borderRadius) {
    const cornerProps = new Map<string, RobloxValue>();
    cornerProps.set("CornerRadius", acc.borderRadius);
    pseudos.push({ type: "UICorner", properties: cornerProps });
  }

  // Border -> ::UIStroke
  if (acc.borderWidth && acc.borderStyle !== "none") {
    const strokeProps = new Map<string, RobloxValue>();
    strokeProps.set("Thickness", {
      type: "number",
      value: acc.borderWidth,
    });
    if (acc.borderColorToken) {
      strokeProps.set("Color", acc.borderColorToken);
    } else if (acc.borderColor) {
      strokeProps.set("Color", {
        type: "Color3",
        value: acc.borderColor,
      });
    }
    if (acc.borderTransparency !== undefined) {
      strokeProps.set("Transparency", {
        type: "number",
        value: acc.borderTransparency,
      });
    }
    strokeProps.set("ApplyStrokeMode", {
      type: "Enum",
      enum: "ApplyStrokeMode",
      value: acc.borderStyle === "outline" ? "Contextual" : "Border",
    });
    pseudos.push({ type: "UIStroke", properties: strokeProps });
  }

  // Flex -> ::UIListLayout
  // Generate UIListLayout if display:flex is set, OR if any flex layout
  // properties are set individually (for utility-first CSS like Tailwind)
  const hasFlexProperties =
    acc.justifyContent !== undefined ||
    acc.alignItems !== undefined ||
    acc.flexDirection !== undefined ||
    acc.flexWrap !== undefined ||
    acc.gap !== undefined;
  if (acc.hasFlex || hasFlexProperties) {
    const layoutProps = new Map<string, RobloxValue>();
    // A flex container lays its children out in source order. Roblox defaults a
    // UIListLayout to sorting by Name, which reorders the markup alphabetically,
    // so the layout has to be told to use LayoutOrder instead.
    layoutProps.set("SortOrder", {
      type: "Enum",
      enum: "SortOrder",
      value: "LayoutOrder",
    });
    if (acc.hasFlex || acc.flexDirection) {
      layoutProps.set(
        "FillDirection",
        mapFillDirection(acc.flexDirection ?? "row")
      );
    }
    if (acc.justifyContent) {
      const alignment = mapJustifyContent(
        acc.justifyContent,
        acc.flexDirection
      );
      if (alignment) layoutProps.set(alignment.prop, alignment.value);
    }
    if (acc.alignItems) {
      const alignment = mapAlignItems(acc.alignItems, acc.flexDirection);
      if (alignment) layoutProps.set(alignment.prop, alignment.value);
    }
    if (acc.gap) layoutProps.set("Padding", acc.gap);
    if (acc.flexWrap) {
      layoutProps.set("Wraps", { type: "boolean", value: true });
    }
    pseudos.push({ type: "UIListLayout", properties: layoutProps });
  }

  // Flex item -> ::UIFlexItem
  if (
    acc.flexGrow !== undefined ||
    acc.flexShrink !== undefined ||
    acc.alignSelf !== undefined
  ) {
    const flexProps = new Map<string, RobloxValue>();
    if (acc.flexGrow !== undefined || acc.flexShrink !== undefined) {
      flexProps.set("FlexMode", {
        type: "Enum",
        enum: "UIFlexMode",
        value: "Custom",
      });
      if (acc.flexGrow !== undefined) {
        flexProps.set("GrowRatio", {
          type: "number",
          value: acc.flexGrow,
        });
      }
      if (acc.flexShrink !== undefined) {
        flexProps.set("ShrinkRatio", {
          type: "number",
          value: acc.flexShrink,
        });
      }
    }
    if (acc.alignSelf) {
      const alignment = mapAlignSelf(acc.alignSelf);
      if (alignment) flexProps.set("ItemLineAlignment", alignment);
    }
    pseudos.push({ type: "UIFlexItem", properties: flexProps });
  }

  // Gradient -> ::UIGradient
  if (acc.gradientStops && acc.gradientStops.length > 0) {
    const gradientProps = new Map<string, RobloxValue>();
    gradientProps.set("Color", {
      type: "ColorSequence",
      stops: acc.gradientStops,
    });
    if (acc.gradientRotation !== undefined) {
      gradientProps.set("Rotation", {
        type: "number",
        value: acc.gradientRotation,
      });
    }
    pseudos.push({ type: "UIGradient", properties: gradientProps });
  }

  // Aspect ratio -> ::UIAspectRatioConstraint
  if (acc.aspectRatio !== undefined) {
    const aspectProps = new Map<string, RobloxValue>();
    aspectProps.set("AspectRatio", {
      type: "number",
      value: acc.aspectRatio,
    });
    pseudos.push({ type: "UIAspectRatioConstraint", properties: aspectProps });
  }

  // Size constraints -> ::UISizeConstraint
  if (
    acc.minWidth !== undefined ||
    acc.maxWidth !== undefined ||
    acc.minHeight !== undefined ||
    acc.maxHeight !== undefined
  ) {
    const constraintProps = new Map<string, RobloxValue>();
    if (acc.minWidth !== undefined || acc.minHeight !== undefined) {
      constraintProps.set("MinSize", {
        type: "Vector2",
        value: [acc.minWidth ?? 0, acc.minHeight ?? 0],
      });
    }
    if (acc.maxWidth !== undefined || acc.maxHeight !== undefined) {
      constraintProps.set("MaxSize", {
        type: "Vector2",
        value: [acc.maxWidth ?? Infinity, acc.maxHeight ?? Infinity],
      });
    }
    pseudos.push({ type: "UISizeConstraint", properties: constraintProps });
  }

  // Transform: scale() -> ::UIScale
  if (acc.scale !== undefined) {
    const scaleProps = new Map<string, RobloxValue>();
    scaleProps.set("Scale", { type: "number", value: acc.scale });
    pseudos.push({ type: "UIScale", properties: scaleProps });
  }

  // Transform: rotate() -> Rotation (direct prop)
  if (acc.rotation !== undefined) {
    props.set("Rotation", { type: "number", value: acc.rotation });
  }

  // Grid layout -> ::UIGridLayout
  if (acc.hasGrid) {
    const gridProps = new Map<string, RobloxValue>();
    if (acc.gridCellWidth || acc.gridCellHeight) {
      const cellW = acc.gridCellWidth ?? { scale: 0, offset: 100 };
      const cellH = acc.gridCellHeight ?? { scale: 0, offset: 100 };
      gridProps.set("CellSize", {
        type: "UDim2",
        value: [cellW.scale, cellW.offset, cellH.scale, cellH.offset],
      });
    }
    if (acc.gridGapX || acc.gridGapY) {
      const gapX = acc.gridGapX ?? {
        type: "UDim" as const,
        value: [0, 0] as [number, number],
      };
      const gapY = acc.gridGapY ?? {
        type: "UDim" as const,
        value: [0, 0] as [number, number],
      };
      const xVal = (gapX as { type: "UDim"; value: [number, number] }).value;
      const yVal = (gapY as { type: "UDim"; value: [number, number] }).value;
      gridProps.set("CellPadding", {
        type: "UDim2",
        value: [xVal[0], xVal[1], yVal[0], yVal[1]],
      });
    }
    if (acc.gridMaxCellsPerRow !== undefined) {
      gridProps.set("FillDirectionMaxCells", {
        type: "number",
        value: acc.gridMaxCellsPerRow,
      });
    }
    gridProps.set("SortOrder", {
      type: "Enum",
      enum: "SortOrder",
      value: "LayoutOrder",
    });
    pseudos.push({ type: "UIGridLayout", properties: gridProps });
  }

  return pseudos;
}
