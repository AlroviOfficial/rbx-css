import type { WarningCollector } from "../warnings.ts";

const FONT_FAMILY_MAP: Record<string, string> = {
  gothamssm: "GothamSSm",
  gotham: "GothamSSm",
  "builder sans": "BuilderSans",
  "source sans pro": "SourceSansPro",
  roboto: "Roboto",
  montserrat: "Montserrat",
  monospace: "RobotoMono",
  "sans-serif": "GothamSSm",
  serif: "Merriweather",
};

export function mapFontFamily(
  families: string[],
  warnings: WarningCollector
): string {
  for (const raw of families) {
    const normalized = raw.replace(/['"]/g, "").trim().toLowerCase();
    const mapped = FONT_FAMILY_MAP[normalized];
    if (mapped) return mapped;
  }

  const name = families[0]!.replace(/['"]/g, "").trim();
  warnings.warn({
    code: "partial-mapping",
    message: `Unknown font '${name}', assuming rbxasset://fonts/families/${name}.json`,
  });
  return name;
}

const WEIGHT_MAP: Record<string, string> = {
  "100": "Thin",
  thin: "Thin",
  "200": "ExtraLight",
  "extra-light": "ExtraLight",
  "300": "Light",
  light: "Light",
  "400": "Regular",
  normal: "Regular",
  "500": "Medium",
  medium: "Medium",
  "600": "SemiBold",
  "semi-bold": "SemiBold",
  "700": "Bold",
  bold: "Bold",
  "800": "ExtraBold",
  "extra-bold": "ExtraBold",
  "900": "Heavy",
  black: "Heavy",
};

export function mapFontWeight(weight: string | number): string {
  return WEIGHT_MAP[String(weight).toLowerCase()] ?? "Regular";
}

export function mapFontStyle(style: string): string {
  return style === "italic" ? "Italic" : "Normal";
}
