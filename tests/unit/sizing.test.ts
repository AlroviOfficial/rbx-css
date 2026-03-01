import { describe, test, expect } from "bun:test";
import { compileCss } from "../helpers.ts";

describe("viewport units", () => {
  test("width: 100vw -> UDim2 with scale 1", () => {
    const result = compileCss(`.a { width: 100vw; height: 50vh; }`);
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size!.type).toBe("UDim2");
    if (size!.type === "UDim2") {
      expect(size!.value[0]).toBe(1);    // x scale
      expect(size!.value[1]).toBe(0);    // x offset
      expect(size!.value[2]).toBe(0.5);  // y scale
      expect(size!.value[3]).toBe(0);    // y offset
    }
  });
});

describe("width only (no height)", () => {
  test("width alone -> Size UDim2 with height 0", () => {
    const result = compileCss(`.a { width: 300px; }`);
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size!.type).toBe("UDim2");
    if (size!.type === "UDim2") {
      expect(size!.value[0]).toBe(0);
      expect(size!.value[1]).toBe(300);
      expect(size!.value[2]).toBe(0);
      expect(size!.value[3]).toBe(0);
    }
  });
});

describe("height only (no width)", () => {
  test("height alone -> Size UDim2 with width 0", () => {
    const result = compileCss(`.a { height: 100px; }`);
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size!.type).toBe("UDim2");
    if (size!.type === "UDim2") {
      expect(size!.value[0]).toBe(0);
      expect(size!.value[1]).toBe(0);
      expect(size!.value[2]).toBe(0);
      expect(size!.value[3]).toBe(100);
    }
  });
});

describe("percentage sizing", () => {
  test("width: 75% -> 0.75 scale", () => {
    const result = compileCss(`.a { width: 75%; height: 25%; }`);
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size!.type).toBe("UDim2");
    if (size!.type === "UDim2") {
      expect(size!.value[0]).toBeCloseTo(0.75, 2);
      expect(size!.value[2]).toBeCloseTo(0.25, 2);
    }
  });
});

describe("auto sizing edge cases", () => {
  test("height: auto only -> AutomaticSize.Y, no Size", () => {
    const result = compileCss(`.a { height: auto; }`);
    const auto = result.ir.rules[0]!.properties.get("AutomaticSize");
    expect(auto).toEqual({ type: "Enum", enum: "AutomaticSize", value: "Y" });
  });

  test("width: auto only -> AutomaticSize.X, no Size", () => {
    const result = compileCss(`.a { width: auto; }`);
    const auto = result.ir.rules[0]!.properties.get("AutomaticSize");
    expect(auto).toEqual({ type: "Enum", enum: "AutomaticSize", value: "X" });
  });
});

describe("position", () => {
  test("left only -> Position UDim2 with top 0", () => {
    const result = compileCss(`.a { left: 50px; }`);
    const pos = result.ir.rules[0]!.properties.get("Position");
    expect(pos!.type).toBe("UDim2");
    if (pos!.type === "UDim2") {
      expect(pos!.value[0]).toBe(0);
      expect(pos!.value[1]).toBe(50);
      expect(pos!.value[2]).toBe(0);
      expect(pos!.value[3]).toBe(0);
    }
  });

  test("top only -> Position UDim2 with left 0", () => {
    const result = compileCss(`.a { top: 30%; }`);
    const pos = result.ir.rules[0]!.properties.get("Position");
    expect(pos!.type).toBe("UDim2");
    if (pos!.type === "UDim2") {
      expect(pos!.value[0]).toBe(0);
      expect(pos!.value[1]).toBe(0);
      expect(pos!.value[2]).toBeCloseTo(0.3, 2);
      expect(pos!.value[3]).toBe(0);
    }
  });
});

describe("z-index", () => {
  test("negative z-index", () => {
    const result = compileCss(`.a { z-index: -1; }`);
    const z = result.ir.rules[0]!.properties.get("ZIndex");
    expect(z).toEqual({ type: "number", value: -1 });
  });

  test("large z-index", () => {
    const result = compileCss(`.a { z-index: 999; }`);
    const z = result.ir.rules[0]!.properties.get("ZIndex");
    expect(z).toEqual({ type: "number", value: 999 });
  });
});

describe("size constraints", () => {
  test("only min-width -> MinSize with default min-height 0", () => {
    const result = compileCss(`.a { min-width: 100px; }`);
    const rule = result.ir.rules.find(r => r.selector.includes("UISizeConstraint"));
    expect(rule).toBeDefined();
    expect(rule!.properties.get("MinSize")).toEqual({
      type: "Vector2", value: [100, 0],
    });
    expect(rule!.properties.has("MaxSize")).toBe(false);
  });

  test("only max-height -> MaxSize with Infinity for max-width", () => {
    const result = compileCss(`.a { max-height: 500px; }`);
    const rule = result.ir.rules.find(r => r.selector.includes("UISizeConstraint"));
    expect(rule).toBeDefined();
    const maxSize = rule!.properties.get("MaxSize");
    expect(maxSize!.type).toBe("Vector2");
    if (maxSize!.type === "Vector2") {
      expect(maxSize!.value[0]).toBe(Infinity);
      expect(maxSize!.value[1]).toBe(500);
    }
  });

  test("min-width + max-width only (no height constraints)", () => {
    const result = compileCss(`.a { min-width: 100px; max-width: 400px; }`);
    const rule = result.ir.rules.find(r => r.selector.includes("UISizeConstraint"));
    expect(rule).toBeDefined();
    expect(rule!.properties.get("MinSize")).toEqual({
      type: "Vector2", value: [100, 0],
    });
    const maxSize = rule!.properties.get("MaxSize");
    if (maxSize!.type === "Vector2") {
      expect(maxSize!.value[0]).toBe(400);
      expect(maxSize!.value[1]).toBe(Infinity);
    }
  });
});

describe("aspect-ratio", () => {
  test("aspect-ratio: 1 -> 1", () => {
    const result = compileCss(`.a { aspect-ratio: 1; }`);
    const rule = result.ir.rules.find(r => r.selector.includes("UIAspectRatioConstraint"));
    expect(rule).toBeDefined();
    const ratio = rule!.properties.get("AspectRatio");
    expect(ratio!.type).toBe("number");
    if (ratio!.type === "number") {
      expect(ratio!.value).toBe(1);
    }
  });

  test("aspect-ratio: 4 / 3", () => {
    const result = compileCss(`.a { aspect-ratio: 4 / 3; }`);
    const rule = result.ir.rules.find(r => r.selector.includes("UIAspectRatioConstraint"));
    const ratio = rule!.properties.get("AspectRatio");
    if (ratio!.type === "number") {
      expect(ratio!.value).toBeCloseTo(4 / 3, 4);
    }
  });
});

describe("transform-origin", () => {
  test("top left -> 0, 0", () => {
    const result = compileCss(`.a { transform-origin: top left; }`);
    const anchor = result.ir.rules[0]!.properties.get("AnchorPoint");
    expect(anchor).toEqual({ type: "Vector2", value: [0, 0] });
  });

  test("bottom right -> 1, 1", () => {
    const result = compileCss(`.a { transform-origin: bottom right; }`);
    const anchor = result.ir.rules[0]!.properties.get("AnchorPoint");
    expect(anchor).toEqual({ type: "Vector2", value: [1, 1] });
  });

  test("left top -> 0, 0", () => {
    const result = compileCss(`.a { transform-origin: left top; }`);
    const anchor = result.ir.rules[0]!.properties.get("AnchorPoint");
    expect(anchor).toEqual({ type: "Vector2", value: [0, 0] });
  });
});

describe("rem units", () => {
  test("width in rem converts to px (1rem = 16px)", () => {
    const result = compileCss(`.a { width: 10rem; }`);
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size).toEqual({ type: "UDim2", value: [0, 160, 0, 0] });
  });

  test("height in rem converts to px", () => {
    const result = compileCss(`.a { height: 2.5rem; }`);
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size).toEqual({ type: "UDim2", value: [0, 0, 0, 40] });
  });

  test("padding in rem", () => {
    const result = compileCss(`.a { padding: 1rem; }`);
    const rule = result.ir.rules.find(r => r.selector.includes("UIPadding"));
    expect(rule).toBeDefined();
    expect(rule!.properties.get("PaddingTop")).toEqual({
      type: "UDim", value: [0, 16],
    });
  });

  test("gap in rem", () => {
    const result = compileCss(`.a { display: flex; gap: 0.5rem; }`);
    const rule = result.ir.rules.find(r => r.selector.includes("UIListLayout"));
    expect(rule!.properties.get("Padding")).toEqual({
      type: "UDim", value: [0, 8],
    });
  });

  test("border-radius in rem", () => {
    const result = compileCss(`.a { border-radius: 0.5rem; }`);
    const rule = result.ir.rules.find(r => r.selector.includes("UICorner"));
    expect(rule!.properties.get("CornerRadius")).toEqual({
      type: "UDim", value: [0, 8],
    });
  });
});

describe("em units", () => {
  test("em converts same as rem (base 16)", () => {
    const result = compileCss(`.a { width: 5em; }`);
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size).toEqual({ type: "UDim2", value: [0, 80, 0, 0] });
  });
});

describe("font-size with rem/em", () => {
  test("font-size in rem converts to px", () => {
    const result = compileCss(`.a { font-size: 0.875rem; }`);
    const textSize = result.ir.rules[0]!.properties.get("TextSize");
    expect(textSize).toEqual({ type: "number", value: 14 });
  });

  test("font-size in em converts to px", () => {
    const result = compileCss(`.a { font-size: 1.5em; }`);
    const textSize = result.ir.rules[0]!.properties.get("TextSize");
    expect(textSize).toEqual({ type: "number", value: 24 });
  });
});

describe("size constraints with rem", () => {
  test("min-width in rem converts to px", () => {
    const result = compileCss(`.a { min-width: 6.25rem; }`);
    const rule = result.ir.rules.find(r => r.selector.includes("UISizeConstraint"));
    expect(rule).toBeDefined();
    expect(rule!.properties.get("MinSize")).toEqual({
      type: "Vector2", value: [100, 0],
    });
  });

  test("max-width in rem converts to px", () => {
    const result = compileCss(`.a { max-width: 28rem; }`);
    const rule = result.ir.rules.find(r => r.selector.includes("UISizeConstraint"));
    expect(rule).toBeDefined();
    const maxSize = rule!.properties.get("MaxSize");
    expect(maxSize!.type).toBe("Vector2");
    if (maxSize!.type === "Vector2") {
      expect(maxSize!.value[0]).toBe(448);
      expect(maxSize!.value[1]).toBe(Infinity);
    }
  });
});
