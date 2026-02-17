import { describe, test, expect } from "bun:test";
import { compile } from "../../src/compiler.ts";
import { generateLuau } from "../../src/codegen/luau.ts";

function compileCss(css: string) {
  return compile(
    [{ filename: "test.css", content: css }],
    { name: "Test", warnLevel: "none", strict: false },
  );
}

describe("background-image: url()", () => {
  test("rbxassetid URL -> Image property", () => {
    const result = compileCss(`.a { background-image: url("rbxassetid://12345"); }`);
    const img = result.ir.rules[0]!.properties.get("Image");
    expect(img).toEqual({ type: "string", value: "rbxassetid://12345" });
  });

  test("asset URL passes through", () => {
    const result = compileCss(`.a { background-image: url("rbxasset://textures/foo.png"); }`);
    const img = result.ir.rules[0]!.properties.get("Image");
    expect(img!.type).toBe("string");
    if (img!.type === "string") {
      expect(img!.value).toContain("rbxasset://");
    }
  });
});

describe("object-fit", () => {
  test("cover -> ScaleType.Crop", () => {
    const result = compileCss(`img { object-fit: cover; }`);
    const scale = result.ir.rules[0]!.properties.get("ScaleType");
    expect(scale).toEqual({ type: "Enum", enum: "ScaleType", value: "Crop" });
  });

  test("contain -> ScaleType.Fit", () => {
    const result = compileCss(`img { object-fit: contain; }`);
    const scale = result.ir.rules[0]!.properties.get("ScaleType");
    expect(scale).toEqual({ type: "Enum", enum: "ScaleType", value: "Fit" });
  });

  test("fill -> ScaleType.Stretch", () => {
    const result = compileCss(`img { object-fit: fill; }`);
    const scale = result.ir.rules[0]!.properties.get("ScaleType");
    expect(scale).toEqual({ type: "Enum", enum: "ScaleType", value: "Stretch" });
  });
});

describe("gradient", () => {
  test("gradient without explicit angle defaults to 0 or undefined rotation", () => {
    const result = compileCss(`.a { background: linear-gradient(red, blue); }`);
    const gradientRule = result.ir.rules.find(r => r.selector.includes("UIGradient"));
    expect(gradientRule).toBeDefined();
    const color = gradientRule!.properties.get("Color");
    expect(color!.type).toBe("ColorSequence");
  });

  test("3-stop gradient produces 3 keypoints", () => {
    const result = compileCss(`.a { background: linear-gradient(90deg, red, green, blue); }`);
    const gradientRule = result.ir.rules.find(r => r.selector.includes("UIGradient"));
    const color = gradientRule!.properties.get("Color");
    if (color!.type === "ColorSequence") {
      expect(color!.stops.length).toBe(3);
      expect(color!.stops[0]!.position).toBeCloseTo(0, 2);
      expect(color!.stops[1]!.position).toBeCloseTo(0.5, 2);
      expect(color!.stops[2]!.position).toBeCloseTo(1, 2);
    }
  });

  test("gradient with explicit stop positions", () => {
    const result = compileCss(`.a { background: linear-gradient(90deg, red 0%, blue 100%); }`);
    const gradientRule = result.ir.rules.find(r => r.selector.includes("UIGradient"));
    const color = gradientRule!.properties.get("Color");
    if (color!.type === "ColorSequence") {
      expect(color!.stops[0]!.position).toBe(0);
      expect(color!.stops[1]!.position).toBe(1);
    }
  });

  test("gradient rotation in degrees", () => {
    const result = compileCss(`.a { background: linear-gradient(45deg, red, blue); }`);
    const gradientRule = result.ir.rules.find(r => r.selector.includes("UIGradient"));
    expect(gradientRule!.properties.get("Rotation")).toEqual({ type: "number", value: 45 });
  });

  test("gradient Luau uses ColorSequence", () => {
    const result = compileCss(`.a { background: linear-gradient(90deg, #ff0000, #0000ff); }`);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain("ColorSequence.new");
    expect(luau).toContain("Rotation = 90");
  });
});
