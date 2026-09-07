import type { RobloxValue } from "../ir/types.ts";
import type { WarningCollector } from "../warnings.ts";

export interface UDimResult {
  scale: number;
  offset: number;
}

export function convertLengthDimension(
  dim: unknown,
  warnings: WarningCollector
): UDimResult | "auto" | null {
  if (!dim || typeof dim !== "object") return null;

  const d = dim as Record<string, unknown>;

  if (d.type === "dimension") {
    const val = d.value as Record<string, unknown>;
    const unit = val.unit as string;
    const value = val.value as number;

    switch (unit) {
      case "px":
        return { scale: 0, offset: value };
      case "rem":
        return { scale: 0, offset: value * 16 };
      case "em":
        // em is parent-relative in CSS; Roblox has no cascading font-size,
        // so we approximate using the root base of 16px (same as rem).
        return { scale: 0, offset: value * 16 };
      case "vw":
      case "vh":
        return { scale: value / 100, offset: 0 };
      default:
        warnings.warn({
          code: "unsupported-unit",
          message: `'${unit}' not supported, consider using 'px' - skipped`,
        });
        return null;
    }
  }

  if (d.type === "percentage") {
    // lightningcss gives percentages as 0-1 (e.g. 50% = 0.5)
    const value = d.value as number;
    return { scale: value, offset: 0 };
  }

  if (d.type === "calc") {
    const result = convertCalc(d.value);
    if (result) return result;
    warnings.warn({
      code: "unsupported-unit",
      message:
        "only calc() of percentages and absolute lengths maps to a UDim - skipped",
    });
    return null;
  }

  return null;
}

/**
 * Reduce a calc() to a scale/offset pair.
 *
 * A Roblox UDim is precisely a percentage plus a pixel offset, so the mixed
 * form CSS can only express through calc() — `calc(100% - 142px)` — is the one
 * that maps exactly. Anything needing real arithmetic (multiplication, nested
 * units, var() operands) has no UDim equivalent and is rejected.
 */
function convertCalc(node: unknown): UDimResult | null {
  const expr = unwrapCalc(node);
  if (!expr) return null;
  return reduceCalc(expr, { scale: 0, offset: 0 });
}

function unwrapCalc(node: unknown): Record<string, unknown> | null {
  let current = node as Record<string, unknown> | null;
  // lightningcss nests the expression as function -> calc -> <expr>.
  while (current && (current.type === "function" || current.type === "calc")) {
    current = current.value as Record<string, unknown> | null;
  }
  return current;
}

function reduceCalc(
  node: Record<string, unknown>,
  total: UDimResult
): UDimResult | null {
  if (node.type === "sum") {
    const terms = node.value as unknown[];
    let acc: UDimResult | null = total;
    for (const term of terms) {
      acc = reduceCalc(term as Record<string, unknown>, acc);
      if (!acc) return null;
    }
    return acc;
  }

  if (node.type === "value") {
    const leaf = node.value as Record<string, unknown>;

    if (leaf.type === "percentage") {
      return {
        scale: total.scale + (leaf.value as number),
        offset: total.offset,
      };
    }

    if (leaf.type === "dimension") {
      const dim = leaf.value as Record<string, unknown>;
      const unit = dim.unit as string;
      const value = dim.value as number;
      if (unit === "px") return { scale: total.scale, offset: total.offset + value };
      if (unit === "rem" || unit === "em") {
        return { scale: total.scale, offset: total.offset + value * 16 };
      }
      if (unit === "vw" || unit === "vh") {
        return { scale: total.scale + value / 100, offset: total.offset };
      }
      return null;
    }

    if (leaf.type === "number") {
      return { scale: total.scale, offset: total.offset + (leaf.value as number) };
    }
  }

  return null;
}

export function convertLengthValue(
  len: unknown,
  warnings: WarningCollector
): UDimResult | null {
  if (!len || typeof len !== "object") return null;

  const l = len as Record<string, unknown>;
  const unit = l.unit as string;
  const value = l.value as number;

  if (!unit || value === undefined) return null;

  switch (unit) {
    case "px":
      return { scale: 0, offset: value };
    case "rem":
      return { scale: 0, offset: value * 16 };
    case "em":
      // em is parent-relative in CSS; approximated as rem (base 16px).
      return { scale: 0, offset: value * 16 };
    case "vw":
    case "vh":
      return { scale: value / 100, offset: 0 };
    default:
      warnings.warn({
        code: "unsupported-unit",
        message: `'${unit}' not supported, consider using 'px' - skipped`,
      });
      return null;
  }
}

export function toUDim(result: UDimResult): RobloxValue {
  return { type: "UDim", value: [result.scale, result.offset] };
}

export function toUDim2(x: UDimResult, y: UDimResult): RobloxValue {
  return {
    type: "UDim2",
    value: [x.scale, x.offset, y.scale, y.offset],
  };
}
