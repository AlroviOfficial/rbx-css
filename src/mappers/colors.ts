export interface ColorResult {
  color: [number, number, number];
  transparency?: number;
}

export function convertCssColor(cssColor: unknown): ColorResult | null {
  if (!cssColor || typeof cssColor !== "object") return null;

  const c = cssColor as Record<string, unknown>;

  if (c.type === "rgb") {
    const r = Math.round(c.r as number);
    const g = Math.round(c.g as number);
    const b = Math.round(c.b as number);
    const alpha = c.alpha as number;
    return {
      color: [r, g, b],
      transparency: alpha < 1 ? 1 - alpha : undefined,
    };
  }

  if (c.type === "currentcolor") {
    return null;
  }

  return null;
}

export const NAMED_COLORS: Record<string, [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
};

export function parseNamedColor(name: string): ColorResult | null {
  if (name === "transparent") {
    return { color: [0, 0, 0], transparency: 1 };
  }
  const c = NAMED_COLORS[name.toLowerCase()];
  if (c) return { color: c };
  return null;
}

export function rgbToHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")
  );
}
