import { describe, test, expect } from "bun:test";
import { compile } from "../../src/compiler.ts";
import { generateLuau } from "../../src/codegen/luau.ts";

function compileCss(css: string) {
  return compile(
    [{ filename: "test.css", content: css }],
    { name: "Test", warnLevel: "none", strict: false },
  );
}

describe("hex colors", () => {
  test("6-digit hex", () => {
    const result = compileCss(`.a { background-color: #ff0099; }`);
    const color = result.ir.rules[0]!.properties.get("BackgroundColor3");
    expect(color).toEqual({ type: "Color3", value: [255, 0, 153] });
  });

  test("3-digit hex shorthand is expanded", () => {
    const result = compileCss(`.a { background-color: #f09; }`);
    const color = result.ir.rules[0]!.properties.get("BackgroundColor3");
    expect(color!.type).toBe("Color3");
    if (color!.type === "Color3") {
      expect(color!.value[0]).toBe(255);
      expect(color!.value[1]).toBe(0);
      expect(color!.value[2]).toBe(153);
    }
  });
});

describe("rgb/rgba", () => {
  test("rgb() function", () => {
    const result = compileCss(`.a { color: rgb(100, 200, 50); }`);
    const color = result.ir.rules[0]!.properties.get("TextColor3");
    expect(color).toEqual({ type: "Color3", value: [100, 200, 50] });
  });

  test("rgba() with 0.5 alpha -> BackgroundTransparency = 0.5", () => {
    const result = compileCss(`.a { background-color: rgba(255, 0, 0, 0.5); }`);
    const transparency = result.ir.rules[0]!.properties.get("BackgroundTransparency");
    expect(transparency!.type).toBe("number");
    if (transparency!.type === "number") {
      expect(transparency!.value).toBe(0.5);
    }
  });

  test("rgba() with 0 alpha -> BackgroundTransparency = 1", () => {
    const result = compileCss(`.a { background-color: rgba(0, 0, 0, 0); }`);
    const transparency = result.ir.rules[0]!.properties.get("BackgroundTransparency");
    expect(transparency!.type).toBe("number");
    if (transparency!.type === "number") {
      expect(transparency!.value).toBe(1);
    }
  });

  test("rgba on color sets TextTransparency", () => {
    const result = compileCss(`.a { color: rgba(255, 255, 255, 0.5); }`);
    expect(result.ir.rules[0]!.properties.has("TextTransparency")).toBe(true);
    expect(result.ir.rules[0]!.properties.has("TextColor3")).toBe(true);
  });

  test("fully opaque rgba (alpha=1) does not set transparency", () => {
    const result = compileCss(`.a { background-color: rgba(255, 0, 0, 1); }`);
    expect(result.ir.rules[0]!.properties.has("BackgroundTransparency")).toBe(false);
    expect(result.ir.rules[0]!.properties.has("BackgroundColor3")).toBe(true);
  });
});

describe("hsl/hsla", () => {
  test("hsl() converts to Color3 through lightningcss", () => {
    // lightningcss converts hsl to rgb internally
    const result = compileCss(`.a { color: hsl(0, 100%, 50%); }`);
    const color = result.ir.rules[0]!.properties.get("TextColor3");
    expect(color!.type).toBe("Color3");
    if (color!.type === "Color3") {
      // hsl(0, 100%, 50%) = pure red
      expect(color!.value[0]).toBe(255);
      expect(color!.value[1]).toBe(0);
      expect(color!.value[2]).toBe(0);
    }
  });

  test("hsla() with alpha sets transparency", () => {
    const result = compileCss(`.a { background-color: hsla(120, 100%, 50%, 0.5); }`);
    expect(result.ir.rules[0]!.properties.has("BackgroundTransparency")).toBe(true);
    const color = result.ir.rules[0]!.properties.get("BackgroundColor3");
    expect(color!.type).toBe("Color3");
    if (color!.type === "Color3") {
      // hsl(120, 100%, 50%) = pure green = rgb(0, 255, 0)
      expect(color!.value[0]).toBe(0);
      expect(color!.value[1]).toBe(255);
    }
  });
});

describe("named colors", () => {
  test("named colors from spec", () => {
    // lightningcss normalizes named colors to rgb
    const cases: [string, number, number, number][] = [
      ["white", 255, 255, 255],
      ["black", 0, 0, 0],
      ["red", 255, 0, 0],
      ["blue", 0, 0, 255],
    ];
    for (const [name, r, g, b] of cases) {
      const result = compileCss(`.a { color: ${name}; }`);
      const color = result.ir.rules[0]!.properties.get("TextColor3");
      expect(color!.type).toBe("Color3");
      if (color!.type === "Color3") {
        expect(color!.value).toEqual([r, g, b]);
      }
    }
  });
});

describe("transparent", () => {
  test("background: transparent -> BackgroundTransparency = 1", () => {
    const result = compileCss(`.a { background: transparent; }`);
    const transparency = result.ir.rules[0]!.properties.get("BackgroundTransparency");
    expect(transparency).toEqual({ type: "number", value: 1 });
  });
});

describe("opacity", () => {
  test("opacity: 0 -> BackgroundTransparency = 1", () => {
    const result = compileCss(`.a { opacity: 0; }`);
    expect(result.ir.rules[0]!.properties.get("BackgroundTransparency")).toEqual(
      { type: "number", value: 1 },
    );
  });

  test("opacity: 1 -> BackgroundTransparency = 0", () => {
    const result = compileCss(`.a { opacity: 1; }`);
    expect(result.ir.rules[0]!.properties.get("BackgroundTransparency")).toEqual(
      { type: "number", value: 0 },
    );
  });
});

describe("border color transparency rounding", () => {
  test("rgba border color with 0.1 alpha rounds transparency to 0.9", () => {
    const result = compileCss(`.a { border: 1px solid rgba(255, 255, 255, 0.1); }`);
    const strokeRule = result.ir.rules.find(r => r.selector.includes("UIStroke"));
    expect(strokeRule).toBeDefined();
    const transparency = strokeRule!.properties.get("Transparency");
    expect(transparency!.type).toBe("number");
    if (transparency!.type === "number") {
      expect(transparency!.value).toBe(0.9);
    }
  });
});
