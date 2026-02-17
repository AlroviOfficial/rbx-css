import type { RobloxValue, PseudoInstanceIR } from "../ir/types.ts";
import type { WarningCollector } from "../warnings.ts";
import { convertCssColor, parseNamedColor } from "./colors.ts";
import {
  convertLengthDimension,
  convertLengthValue,
  toUDim,
  type UDimResult,
} from "./units.ts";
import { mapFontFamily, mapFontWeight, mapFontStyle } from "./fonts.ts";

export interface PropertyMapResult {
  properties: Map<string, RobloxValue>;
  pseudoInstances: PseudoInstanceIR[];
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
  gradientRotation?: number;
  gradientStops?: Array<{
    position: number;
    color: [number, number, number];
  }>;
}

export function mapDeclarations(
  declarations: unknown[],
  warnings: WarningCollector,
): PropertyMapResult {
  const props = new Map<string, RobloxValue>();
  const acc: Accumulator = { hasFlex: false };

  for (const decl of declarations) {
    mapSingleDeclaration(decl as Record<string, unknown>, props, acc, warnings);
  }

  const pseudoInstances = finalizeAccumulator(acc, props, warnings);
  return { properties: props, pseudoInstances };
}

function mapSingleDeclaration(
  decl: Record<string, unknown>,
  props: Map<string, RobloxValue>,
  acc: Accumulator,
  warnings: WarningCollector,
): void {
  const property = decl.property as string;
  const value = decl.value;

  // Handle unparsed declarations (contains var() references)
  if (property === "unparsed") {
    handleUnparsed(value as Record<string, unknown>, props, acc, warnings);
    return;
  }

  // Handle custom properties (:root variables handled elsewhere)
  if (property === "custom") {
    handleCustomProperty(value as Record<string, unknown>, props, acc, warnings);
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
      props.set("BackgroundTransparency", {
        type: "number",
        value: 1 - opacity,
      });
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
      if (row?.type === "length-percentage") {
        const result = convertLengthDimension(
          row.value as Record<string, unknown>,
          warnings,
        );
        if (result && result !== "auto") {
          acc.gap = toUDim(result);
        }
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
      const result = convertCssColor(value);
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
      const v = value as string;
      props.set("TextYAlignment", mapTextYAlignment(v));
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
      const x = v.x as string;
      const y = v.y as string;
      if (x === "hidden" || y === "hidden") {
        props.set("ClipsDescendants", { type: "boolean", value: true });
      }
      if (x === "scroll" || y === "scroll") {
        warnings.warn({
          code: "partial-mapping",
          message:
            "overflow: scroll maps to ScrollingFrame, use ScrollingFrame class directly",
        });
      }
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
  acc: Accumulator,
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
    }
  }
}

function handleSize(
  value: unknown,
  warnings: WarningCollector,
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
  warnings: WarningCollector,
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
  warnings: WarningCollector,
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
  warnings: WarningCollector,
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
  warnings: WarningCollector,
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
    },
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
  warnings: WarningCollector,
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
    if (result && result.color[0] === 0 && result.color[1] === 0 && result.color[2] === 0 && result.transparency === 1) {
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
  _warnings: WarningCollector,
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
                  item.position as Record<string, unknown>,
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
  if (pos.type === "percentage") return (pos.value as number) / 100;
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
  props: Map<string, RobloxValue>,
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
  if (axis.type === "length") {
    const v = axis.value as Record<string, unknown>;
    if (v.type === "percentage") return (v.value as number) / 100;
  }
  return null;
}

function handleOutline(
  value: Record<string, unknown>,
  acc: Accumulator,
  warnings: WarningCollector,
): void {
  // outline maps to UIStroke with ApplyStrokeMode = Contextual
  handleBorder(value, acc, warnings);
  // Override the mode to Contextual for outline
  acc.borderStyle = "outline";
}

function handleCustomProperty(
  value: Record<string, unknown>,
  props: Map<string, RobloxValue>,
  acc: Accumulator,
  warnings: WarningCollector,
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

  // Unknown custom property, skip
}

function handleUnparsed(
  unparsed: Record<string, unknown>,
  props: Map<string, RobloxValue>,
  acc: Accumulator,
  warnings: WarningCollector,
): void {
  const propertyId = unparsed.propertyId as Record<string, unknown>;
  const propName = propertyId.property as string;
  const tokens = unparsed.value as unknown[];

  const varRef = extractVarReference(tokens);
  if (varRef) {
    mapTokenReference(propName, varRef, props, acc);
  } else {
    warnings.warn({
      code: "unsupported-property",
      message: `Could not resolve unparsed value for '${propName}'`,
    });
  }
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

function mapTokenReference(
  cssProperty: string,
  tokenName: string,
  props: Map<string, RobloxValue>,
  acc: Accumulator,
): void {
  const tokenRef: RobloxValue = { type: "token", name: tokenName };

  switch (cssProperty) {
    case "background-color":
      props.set("BackgroundColor3", tokenRef);
      break;
    case "color":
      props.set("TextColor3", tokenRef);
      break;
    case "border-radius":
      acc.borderRadius = tokenRef;
      break;
    case "border-color":
      // Can't split token into individual components
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
      acc.widthX = { scale: 0, offset: 0 }; // placeholder, token overrides in rule
      props.set("Size", tokenRef); // special case
      break;
    case "height":
      acc.heightY = { scale: 0, offset: 0 };
      break;
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
  warnings: WarningCollector,
): number | null {
  const v = value as Record<string, unknown>;
  if (v.type === "length-percentage") {
    const inner = v.value as Record<string, unknown>;
    if (inner.type === "dimension") {
      const dim = inner.value as Record<string, unknown>;
      if (dim.unit === "px") return dim.value as number;
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

function mapFillDirection(direction: string): RobloxValue {
  if (direction === "row" || direction === "row-reverse") {
    return { type: "Enum", enum: "FillDirection", value: "Horizontal" };
  }
  return { type: "Enum", enum: "FillDirection", value: "Vertical" };
}

function mapJustifyContent(
  justifyContent: string,
  flexDirection?: string,
): { prop: string; value: RobloxValue } | null {
  const isHorizontal =
    !flexDirection ||
    flexDirection === "row" ||
    flexDirection === "row-reverse";

  const prop = isHorizontal ? "HorizontalAlignment" : "VerticalAlignment";
  const enumName = isHorizontal
    ? "HorizontalAlignment"
    : "VerticalAlignment";

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
    default:
      return null;
  }
}

function mapAlignItems(
  alignItems: string,
  flexDirection?: string,
): { prop: string; value: RobloxValue } | null {
  const isHorizontal =
    !flexDirection ||
    flexDirection === "row" ||
    flexDirection === "row-reverse";

  // Cross-axis is opposite
  const prop = isHorizontal ? "VerticalAlignment" : "HorizontalAlignment";
  const enumName = isHorizontal
    ? "VerticalAlignment"
    : "HorizontalAlignment";

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
    default:
      return null;
  }
}

function finalizeAccumulator(
  acc: Accumulator,
  props: Map<string, RobloxValue>,
  warnings: WarningCollector,
): PseudoInstanceIR[] {
  const pseudos: PseudoInstanceIR[] = [];

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
    if (acc.borderColor) {
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
  if (acc.hasFlex) {
    const layoutProps = new Map<string, RobloxValue>();
    layoutProps.set(
      "FillDirection",
      mapFillDirection(acc.flexDirection ?? "row"),
    );
    if (acc.justifyContent) {
      const alignment = mapJustifyContent(
        acc.justifyContent,
        acc.flexDirection,
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
  if (acc.flexGrow !== undefined || acc.flexShrink !== undefined) {
    const flexProps = new Map<string, RobloxValue>();
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

  return pseudos;
}
