import { describe, test, expect } from "bun:test";
import { compileCss } from "../helpers.ts";
import { generateLuau } from "../../src/codegen/luau.ts";

function compileAndGenerate(css: string) {
  const result = compileCss(css);
  return generateLuau(result.ir, { minify: false });
}

// Helper: checks the Luau output contains the value serialization
// Works for both SetProperty and SetProperties formats
function expectProp(luau: string, propName: string, valuePart: string) {
  expect(luau).toContain(propName);
  expect(luau).toContain(valuePart);
}

describe("color properties", () => {
  test("background-color: hex", () => {
    const luau = compileAndGenerate(`.a { background-color: #335fff; }`);
    expectProp(luau, "BackgroundColor3", "Color3.fromRGB(51, 95, 255)");
  });

  test("color: named color", () => {
    const luau = compileAndGenerate(`.a { color: white; }`);
    expectProp(luau, "TextColor3", "Color3.fromRGB(255, 255, 255)");
  });

  test("rgba sets BackgroundTransparency", () => {
    const luau = compileAndGenerate(`.a { background-color: rgba(255, 0, 0, 0.5); }`);
    expect(luau).toContain("BackgroundColor3");
    expect(luau).toContain("Color3.fromRGB(255, 0, 0)");
    expect(luau).toContain("BackgroundTransparency");
  });

  test("color rgba sets TextTransparency", () => {
    const luau = compileAndGenerate(`.a { color: rgba(0, 0, 0, 0.5); }`);
    expect(luau).toContain("TextColor3");
    expect(luau).toContain("TextTransparency");
  });

  test("opacity inverts to BackgroundTransparency", () => {
    const result = compileCss(`.a { opacity: 0.8; }`);
    const prop = result.ir.rules[0]!.properties.get("BackgroundTransparency");
    expect(prop).toBeDefined();
    expect(prop!.type).toBe("number");
    if (prop!.type === "number") {
      expect(prop!.value).toBeCloseTo(0.2, 1);
    }
  });
});

describe("sizing", () => {
  test("width + height -> Size UDim2", () => {
    const result = compileCss(`.a { width: 50%; height: 200px; }`);
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size).toBeDefined();
    expect(size!.type).toBe("UDim2");
    if (size!.type === "UDim2") {
      expect(size!.value[0]).toBeCloseTo(0.5, 1);
      expect(size!.value[1]).toBe(0);
      expect(size!.value[2]).toBe(0);
      expect(size!.value[3]).toBe(200);
    }
  });

  test("width: auto; height: auto -> AutomaticSize.XY", () => {
    const luau = compileAndGenerate(`.a { width: auto; height: auto; }`);
    expect(luau).toContain("Enum.AutomaticSize.XY");
  });

  test("width: auto; height: 48px -> AutomaticSize.X + Size", () => {
    const result = compileCss(`.a { width: auto; height: 48px; }`);
    const auto = result.ir.rules[0]!.properties.get("AutomaticSize");
    expect(auto).toEqual({ type: "Enum", enum: "AutomaticSize", value: "X" });
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size!.type).toBe("UDim2");
    if (size!.type === "UDim2") {
      expect(size!.value[3]).toBe(48);
    }
  });

  test("width: 100%; height: auto -> AutomaticSize.Y + Size", () => {
    const result = compileCss(`.a { width: 100%; height: auto; }`);
    const auto = result.ir.rules[0]!.properties.get("AutomaticSize");
    expect(auto).toEqual({ type: "Enum", enum: "AutomaticSize", value: "Y" });
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size!.type).toBe("UDim2");
    if (size!.type === "UDim2") {
      expect(size!.value[0]).toBeCloseTo(1, 1);
    }
  });
});

describe("positioning", () => {
  test("left + top -> Position UDim2", () => {
    const result = compileCss(`.a { left: 10px; top: 20%; }`);
    const pos = result.ir.rules[0]!.properties.get("Position");
    expect(pos).toBeDefined();
    expect(pos!.type).toBe("UDim2");
    if (pos!.type === "UDim2") {
      expect(pos!.value[0]).toBe(0);
      expect(pos!.value[1]).toBe(10);
      expect(pos!.value[2]).toBeCloseTo(0.2, 1);
      expect(pos!.value[3]).toBe(0);
    }
  });

  test("z-index maps to ZIndex", () => {
    const result = compileCss(`.a { z-index: 5; }`);
    const zIndex = result.ir.rules[0]!.properties.get("ZIndex");
    expect(zIndex).toEqual({ type: "number", value: 5 });
  });
});

describe("text properties", () => {
  test("font-size in px", () => {
    const result = compileCss(`.a { font-size: 18px; }`);
    const size = result.ir.rules[0]!.properties.get("TextSize");
    expect(size).toEqual({ type: "number", value: 18 });
  });

  test("text-align", () => {
    const luau = compileAndGenerate(`.a { text-align: center; }`);
    expect(luau).toContain("Enum.TextXAlignment.Center");
  });

  test("word-wrap: break-word", () => {
    const result = compileCss(`.a { word-wrap: break-word; }`);
    const wrapped = result.ir.rules[0]!.properties.get("TextWrapped");
    expect(wrapped).toEqual({ type: "boolean", value: true });
  });

  test("text-overflow: ellipsis", () => {
    const luau = compileAndGenerate(`.a { text-overflow: ellipsis; }`);
    expect(luau).toContain("Enum.TextTruncate.AtEnd");
  });

  test("line-height", () => {
    const result = compileCss(`.a { line-height: 1.5; }`);
    const lh = result.ir.rules[0]!.properties.get("LineHeight");
    expect(lh).toEqual({ type: "number", value: 1.5 });
  });
});

describe("visibility", () => {
  test("display: none -> Visible = false", () => {
    const result = compileCss(`.a { display: none; }`);
    const vis = result.ir.rules[0]!.properties.get("Visible");
    expect(vis).toEqual({ type: "boolean", value: false });
  });

  test("visibility: hidden -> Visible = false", () => {
    const result = compileCss(`.a { visibility: hidden; }`);
    const vis = result.ir.rules[0]!.properties.get("Visible");
    expect(vis).toEqual({ type: "boolean", value: false });
  });

  test("overflow: hidden -> ClipsDescendants = true", () => {
    const result = compileCss(`.a { overflow: hidden; }`);
    const clips = result.ir.rules[0]!.properties.get("ClipsDescendants");
    expect(clips).toEqual({ type: "boolean", value: true });
  });
});

describe("pseudo-instances", () => {
  test("border-radius -> UICorner", () => {
    const result = compileCss(`.a { border-radius: 8px; }`);
    const cornerRule = result.ir.rules.find((r) => r.selector.includes("UICorner"));
    expect(cornerRule).toBeDefined();
    const radius = cornerRule!.properties.get("CornerRadius");
    expect(radius).toEqual({ type: "UDim", value: [0, 8] });
  });

  test("border-radius: 50% -> UICorner with scale", () => {
    const result = compileCss(`.a { border-radius: 50%; }`);
    const cornerRule = result.ir.rules.find((r) => r.selector.includes("UICorner"));
    expect(cornerRule).toBeDefined();
    const radius = cornerRule!.properties.get("CornerRadius");
    expect(radius!.type).toBe("UDim");
    if (radius!.type === "UDim") {
      expect(radius!.value[0]).toBeCloseTo(0.5, 1);
      expect(radius!.value[1]).toBe(0);
    }
  });

  test("border -> UIStroke", () => {
    const result = compileCss(`.a { border: 2px solid #333; }`);
    const strokeRule = result.ir.rules.find((r) => r.selector.includes("UIStroke"));
    expect(strokeRule).toBeDefined();
    expect(strokeRule!.properties.get("Thickness")).toEqual({ type: "number", value: 2 });
    const color = strokeRule!.properties.get("Color");
    expect(color!.type).toBe("Color3");
    if (color!.type === "Color3") {
      expect(color!.value).toEqual([51, 51, 51]);
    }
    expect(strokeRule!.properties.get("ApplyStrokeMode")).toEqual({
      type: "Enum", enum: "ApplyStrokeMode", value: "Border",
    });
  });

  test("padding shorthand 1 value", () => {
    const result = compileCss(`.a { padding: 10px; }`);
    const paddingRule = result.ir.rules.find((r) => r.selector.includes("UIPadding"));
    expect(paddingRule).toBeDefined();
    for (const side of ["PaddingTop", "PaddingRight", "PaddingBottom", "PaddingLeft"]) {
      expect(paddingRule!.properties.get(side)).toEqual({ type: "UDim", value: [0, 10] });
    }
  });

  test("padding shorthand 2 values", () => {
    const result = compileCss(`.a { padding: 12px 16px; }`);
    const paddingRule = result.ir.rules.find((r) => r.selector.includes("UIPadding"));
    expect(paddingRule).toBeDefined();
    expect(paddingRule!.properties.get("PaddingTop")).toEqual({ type: "UDim", value: [0, 12] });
    expect(paddingRule!.properties.get("PaddingRight")).toEqual({ type: "UDim", value: [0, 16] });
    expect(paddingRule!.properties.get("PaddingBottom")).toEqual({ type: "UDim", value: [0, 12] });
    expect(paddingRule!.properties.get("PaddingLeft")).toEqual({ type: "UDim", value: [0, 16] });
  });

  test("padding shorthand 4 values", () => {
    const result = compileCss(`.a { padding: 10px 20px 30px 40px; }`);
    const paddingRule = result.ir.rules.find((r) => r.selector.includes("UIPadding"));
    expect(paddingRule).toBeDefined();
    expect(paddingRule!.properties.get("PaddingTop")).toEqual({ type: "UDim", value: [0, 10] });
    expect(paddingRule!.properties.get("PaddingRight")).toEqual({ type: "UDim", value: [0, 20] });
    expect(paddingRule!.properties.get("PaddingBottom")).toEqual({ type: "UDim", value: [0, 30] });
    expect(paddingRule!.properties.get("PaddingLeft")).toEqual({ type: "UDim", value: [0, 40] });
  });

  test("flexbox -> UIListLayout", () => {
    const result = compileCss(`.a {
      display: flex;
      flex-direction: row;
      gap: 8px;
      flex-wrap: wrap;
    }`);
    const layoutRule = result.ir.rules.find((r) => r.selector.includes("UIListLayout"));
    expect(layoutRule).toBeDefined();
    expect(layoutRule!.properties.get("FillDirection")).toEqual({
      type: "Enum", enum: "FillDirection", value: "Horizontal",
    });
    expect(layoutRule!.properties.get("Padding")).toEqual({ type: "UDim", value: [0, 8] });
    expect(layoutRule!.properties.get("Wraps")).toEqual({ type: "boolean", value: true });
  });

  test("flex-grow/shrink -> UIFlexItem", () => {
    const result = compileCss(`.a { flex-grow: 1; flex-shrink: 0; }`);
    const flexRule = result.ir.rules.find((r) => r.selector.includes("UIFlexItem"));
    expect(flexRule).toBeDefined();
    expect(flexRule!.properties.get("FlexMode")).toEqual({
      type: "Enum", enum: "UIFlexMode", value: "Custom",
    });
    expect(flexRule!.properties.get("GrowRatio")).toEqual({ type: "number", value: 1 });
    expect(flexRule!.properties.get("ShrinkRatio")).toEqual({ type: "number", value: 0 });
  });

  test("aspect-ratio -> UIAspectRatioConstraint", () => {
    const result = compileCss(`.a { aspect-ratio: 16 / 9; }`);
    const aspectRule = result.ir.rules.find((r) =>
      r.selector.includes("UIAspectRatioConstraint"),
    );
    expect(aspectRule).toBeDefined();
    const ratio = aspectRule!.properties.get("AspectRatio");
    expect(ratio!.type).toBe("number");
    if (ratio!.type === "number") {
      expect(ratio!.value).toBeCloseTo(16 / 9, 4);
    }
  });

  test("min/max-width/height -> UISizeConstraint", () => {
    const result = compileCss(`.a {
      min-width: 200px;
      max-width: 500px;
      min-height: 100px;
      max-height: 300px;
    }`);
    const constraintRule = result.ir.rules.find((r) =>
      r.selector.includes("UISizeConstraint"),
    );
    expect(constraintRule).toBeDefined();
    expect(constraintRule!.properties.get("MinSize")).toEqual({
      type: "Vector2", value: [200, 100],
    });
    expect(constraintRule!.properties.get("MaxSize")).toEqual({
      type: "Vector2", value: [500, 300],
    });
  });
});

describe("selectors", () => {
  test("class selector", () => {
    const result = compileCss(`.card { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe(".card");
  });

  test("HTML element -> Roblox class", () => {
    const result = compileCss(`div { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("Frame");
  });

  test("button -> TextButton", () => {
    const result = compileCss(`button { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("TextButton");
  });

  test("span -> TextLabel", () => {
    const result = compileCss(`span { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("TextLabel");
  });

  test("input -> TextBox", () => {
    const result = compileCss(`input { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("TextBox");
  });

  test("img -> ImageLabel", () => {
    const result = compileCss(`img { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("ImageLabel");
  });

  test(":hover -> :Hover", () => {
    const result = compileCss(`.a:hover { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe(".a:Hover");
  });

  test(":active -> :Press", () => {
    const result = compileCss(`.a:active { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe(".a:Press");
  });

  test("child combinator", () => {
    const result = compileCss(`.a > .b { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe(".a > .b");
  });

  test("descendant combinator", () => {
    const result = compileCss(`.a .b { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe(".a .b");
  });

  test("compound selector: element.class", () => {
    const result = compileCss(`button.primary { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("TextButton.primary");
  });

  test("Roblox class name passes through", () => {
    const result = compileCss(`Frame { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("Frame");
  });

  test("ScrollingFrame passes through", () => {
    const result = compileCss(`ScrollingFrame { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("ScrollingFrame");
  });
});

describe("CSS variables / tokens", () => {
  test("var() reference maps to token", () => {
    const result = compileCss(`
      :root { --primary: #335fff; }
      .a { background-color: var(--primary); }
    `);
    const bgProp = result.ir.rules[0]!.properties.get("BackgroundColor3");
    expect(bgProp).toEqual({ type: "token", name: "primary" });
  });

  test("token types are inferred from values", () => {
    const result = compileCss(`
      :root {
        --c: #ff0000;
        --r: 8px;
      }
    `);
    expect(result.ir.tokens.get("c")!.type).toBe("Color3");
    expect(result.ir.tokens.get("r")!.type).toBe("UDim");
  });
});

describe("warnings", () => {
  test("unsupported property emits warning", () => {
    const result = compileCss(`.a { box-shadow: 0 0 10px black; }`, { warnLevel: "all" });
    const warnings = result.warnings.getWarnings();
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("strict mode treats warnings as errors", () => {
    const result = compileCss(`.a { box-shadow: 0 0 10px black; }`, { warnLevel: "all", strict: true });
    expect(result.warnings.hasErrors()).toBe(true);
  });

  test("warn level 'none' suppresses all warnings", () => {
    const result = compileCss(`.a { box-shadow: 0 0 10px black; }`);
    expect(result.warnings.getWarnings().length).toBe(0);
  });
});

describe("font mapping", () => {
  test("font-family with weight and style", () => {
    const result = compileCss(`.a {
      font-family: "GothamSSm";
      font-weight: 700;
      font-style: italic;
    }`);
    const font = result.ir.rules[0]!.properties.get("FontFace");
    expect(font!.type).toBe("Font");
    if (font!.type === "Font") {
      expect(font!.family).toBe("GothamSSm");
      expect(font!.weight).toBe("Bold");
      expect(font!.style).toBe("Italic");
    }
  });

  test("generic font families", () => {
    const luau = compileAndGenerate(`.a { font-family: monospace; }`);
    expect(luau).toContain("RobotoMono.json");
  });
});

describe("gradient", () => {
  test("linear-gradient -> UIGradient", () => {
    const result = compileCss(`.a {
      background: linear-gradient(90deg, #ff0099, #ffcc00);
    }`);
    const gradientRule = result.ir.rules.find((r) =>
      r.selector.includes("UIGradient"),
    );
    expect(gradientRule).toBeDefined();
    expect(gradientRule!.properties.get("Rotation")).toEqual({ type: "number", value: 90 });
    const color = gradientRule!.properties.get("Color");
    expect(color!.type).toBe("ColorSequence");
    if (color!.type === "ColorSequence") {
      expect(color!.stops.length).toBe(2);
      expect(color!.stops[0]!.color).toEqual([255, 0, 153]);
      expect(color!.stops[1]!.color).toEqual([255, 204, 0]);
    }
  });
});

describe("image properties", () => {
  test("background-image: url()", () => {
    const result = compileCss(`.a { background-image: url("rbxassetid://12345"); }`);
    const img = result.ir.rules[0]!.properties.get("Image");
    expect(img).toEqual({ type: "string", value: "rbxassetid://12345" });
  });
});

describe("transform-origin -> AnchorPoint", () => {
  test("center center -> 0.5, 0.5", () => {
    const result = compileCss(`.a { transform-origin: center center; }`);
    const anchor = result.ir.rules[0]!.properties.get("AnchorPoint");
    expect(anchor).toEqual({ type: "Vector2", value: [0.5, 0.5] });
  });
});
