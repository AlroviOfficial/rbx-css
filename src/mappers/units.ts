import type { RobloxValue } from "../ir/types.ts";
import type { WarningCollector } from "../warnings.ts";

export interface UDimResult {
  scale: number;
  offset: number;
}

export function convertLengthDimension(
  dim: unknown,
  warnings: WarningCollector,
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
    warnings.warn({
      code: "unsupported-unit",
      message: "calc() expressions are not supported - skipped",
    });
    return null;
  }

  return null;
}

export function convertLengthValue(
  len: unknown,
  warnings: WarningCollector,
): UDimResult | null {
  if (!len || typeof len !== "object") return null;

  const l = len as Record<string, unknown>;
  const unit = l.unit as string;
  const value = l.value as number;

  if (!unit || value === undefined) return null;

  switch (unit) {
    case "px":
      return { scale: 0, offset: value };
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
