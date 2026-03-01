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
      transparency: alpha < 1 ? Math.round((1 - alpha) * 100) / 100 : undefined,
    };
  }

  if (c.type === "oklch") {
    const rgb = oklchToRgb(c.l as number, c.c as number, c.h as number);
    const alpha = c.alpha as number;
    return {
      color: rgb,
      transparency: alpha < 1 ? Math.round((1 - alpha) * 100) / 100 : undefined,
    };
  }

  if (c.type === "oklab") {
    const rgb = oklabToRgb(c.l as number, c.a as number, c.b as number);
    const alpha = c.alpha as number;
    return {
      color: rgb,
      transparency: alpha < 1 ? Math.round((1 - alpha) * 100) / 100 : undefined,
    };
  }

  if (c.type === "lab") {
    const rgb = labToRgb(c.l as number, c.a as number, c.b as number);
    const alpha = c.alpha as number;
    return {
      color: rgb,
      transparency: alpha < 1 ? Math.round((1 - alpha) * 100) / 100 : undefined,
    };
  }

  if (c.type === "lch") {
    const hRad = ((c.h as number) * Math.PI) / 180;
    const a = (c.c as number) * Math.cos(hRad);
    const b = (c.c as number) * Math.sin(hRad);
    const rgb = labToRgb(c.l as number, a, b);
    const alpha = c.alpha as number;
    return {
      color: rgb,
      transparency: alpha < 1 ? Math.round((1 - alpha) * 100) / 100 : undefined,
    };
  }

  if (c.type === "currentcolor") {
    return null;
  }

  return null;
}

function gammaCorrect(x: number): number {
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function clampRgb(r: number, g: number, b: number): [number, number, number] {
  return [
    Math.round(Math.max(0, Math.min(1, r)) * 255),
    Math.round(Math.max(0, Math.min(1, g)) * 255),
    Math.round(Math.max(0, Math.min(1, b)) * 255),
  ];
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  // OKLab → LMS (cube)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // LMS → linear sRGB
  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return clampRgb(gammaCorrect(rLin), gammaCorrect(gLin), gammaCorrect(bLin));
}

function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const hRad = (H * Math.PI) / 180;
  return oklabToRgb(L, C * Math.cos(hRad), C * Math.sin(hRad));
}

function labToRgb(L: number, a: number, b: number): [number, number, number] {
  // CIE Lab → XYZ (D65 illuminant)
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const delta = 6 / 29;
  const invF = (t: number) =>
    t > delta ? t * t * t : 3 * delta * delta * (t - 4 / 29);

  // D65 white point
  const X = 0.95047 * invF(fx);
  const Y = 1.0 * invF(fy);
  const Z = 1.08883 * invF(fz);

  // XYZ → linear sRGB
  const rLin = +3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gLin = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const bLin = +0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;

  return clampRgb(gammaCorrect(rLin), gammaCorrect(gLin), gammaCorrect(bLin));
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
    "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")
  );
}
