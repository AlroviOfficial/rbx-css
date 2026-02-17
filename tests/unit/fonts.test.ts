import { describe, test, expect } from "bun:test";
import { compile } from "../../src/compiler.ts";
import { generateLuau } from "../../src/codegen/luau.ts";

function compileCss(css: string, warnLevel: "all" | "none" = "none") {
  return compile(
    [{ filename: "test.css", content: css }],
    { name: "Test", warnLevel, strict: false },
  );
}

describe("font-family mapping", () => {
  test("GothamSSm (known Roblox font)", () => {
    const result = compileCss(`.a { font-family: "GothamSSm"; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    expect(font!.type).toBe("Font");
    if (font!.type === "Font") {
      expect(font!.family).toBe("GothamSSm");
    }
  });

  test("case-insensitive matching: gothamssm -> GothamSSm", () => {
    const result = compileCss(`.a { font-family: "gothamssm"; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.family).toBe("GothamSSm");
    }
  });

  test("Gotham alias -> GothamSSm", () => {
    const result = compileCss(`.a { font-family: "Gotham"; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.family).toBe("GothamSSm");
    }
  });

  test("Builder Sans", () => {
    const result = compileCss(`.a { font-family: "Builder Sans"; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.family).toBe("BuilderSans");
    }
  });

  test("Source Sans Pro", () => {
    const result = compileCss(`.a { font-family: "Source Sans Pro"; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.family).toBe("SourceSansPro");
    }
  });

  test("generic serif -> Merriweather", () => {
    const result = compileCss(`.a { font-family: serif; }`);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain("Merriweather.json");
  });

  test("generic sans-serif -> GothamSSm", () => {
    const result = compileCss(`.a { font-family: sans-serif; }`);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain("GothamSSm.json");
  });

  test("fallback list uses first recognized font", () => {
    const result = compileCss(`.a { font-family: "UnknownFont", "Roboto", sans-serif; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.family).toBe("Roboto");
    }
  });

  test("unknown font passes through with warning", () => {
    const result = compileCss(`.a { font-family: "CustomFont"; }`, "all");
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.family).toBe("CustomFont");
    }
    expect(result.warnings.getWarnings().some(w => w.message.includes("CustomFont"))).toBe(true);
  });
});

describe("font-weight mapping", () => {
  test("weight 100 -> Thin", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-weight: 100; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.weight).toBe("Thin");
    }
  });

  test("weight 400 -> Regular", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-weight: 400; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.weight).toBe("Regular");
    }
  });

  test("weight 500 -> Medium", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-weight: 500; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.weight).toBe("Medium");
    }
  });

  test("weight 600 -> SemiBold", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-weight: 600; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.weight).toBe("SemiBold");
    }
  });

  test("weight 800 -> ExtraBold", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-weight: 800; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.weight).toBe("ExtraBold");
    }
  });

  test("weight 900 -> Heavy", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-weight: 900; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.weight).toBe("Heavy");
    }
  });
});

describe("font-style", () => {
  test("normal style", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-style: normal; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.style).toBe("Normal");
    }
  });

  test("italic style", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-style: italic; }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    if (font!.type === "Font") {
      expect(font!.style).toBe("Italic");
    }
  });
});

describe("font Luau serialization", () => {
  test("font with regular weight omits weight arg", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-weight: 400; }`);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain('Font.new("rbxasset://fonts/families/Roboto.json")');
    expect(luau).not.toContain("FontWeight.Regular");
  });

  test("font with bold weight includes weight arg", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-weight: 700; }`);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain("Enum.FontWeight.Bold");
  });

  test("font with italic and regular weight includes both args", () => {
    const result = compileCss(`.a { font-family: "Roboto"; font-style: italic; }`);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain("Enum.FontWeight.Regular");
    expect(luau).toContain("Enum.FontStyle.Italic");
  });
});
