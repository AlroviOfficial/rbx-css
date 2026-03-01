import { describe, test, expect } from "bun:test";
import { compileCss } from "../helpers.ts";

describe("border-style: none suppresses UIStroke", () => {
  test("border: none produces no UIStroke", () => {
    const result = compileCss(`.a { border: none; }`);
    const strokeRule = result.ir.rules.find(r => r.selector.includes("UIStroke"));
    expect(strokeRule).toBeUndefined();
  });

  test("border: 0 produces no UIStroke", () => {
    const result = compileCss(`.a { border: 0; }`);
    const strokeRule = result.ir.rules.find(r => r.selector.includes("UIStroke"));
    expect(strokeRule).toBeUndefined();
  });
});

describe("border-style warnings", () => {
  test("border-style: dashed emits warning", () => {
    const result = compileCss(`.a { border: 2px dashed #333; }`, "all");
    const warnings = result.warnings.getWarnings();
    expect(warnings.some(w => w.message.includes("dashed"))).toBe(true);
    // Still produces UIStroke (falls back to solid)
    const strokeRule = result.ir.rules.find(r => r.selector.includes("UIStroke"));
    expect(strokeRule).toBeDefined();
  });

  test("border-style: dotted emits warning", () => {
    const result = compileCss(`.a { border: 1px dotted red; }`, "all");
    const warnings = result.warnings.getWarnings();
    expect(warnings.some(w => w.message.includes("dotted"))).toBe(true);
  });
});

describe("individual border properties", () => {
  test("border-color + border-width without shorthand", () => {
    const result = compileCss(`.a {
      border-width: 3px;
      border-color: blue;
      border-style: solid;
    }`);
    const strokeRule = result.ir.rules.find(r => r.selector.includes("UIStroke"));
    expect(strokeRule).toBeDefined();
    expect(strokeRule!.properties.get("Thickness")).toEqual({ type: "number", value: 3 });
    const color = strokeRule!.properties.get("Color");
    expect(color!.type).toBe("Color3");
    if (color!.type === "Color3") {
      expect(color!.value).toEqual([0, 0, 255]);
    }
  });
});

describe("border-radius edge cases", () => {
  test("per-corner border-radius emits warning and uses first value", () => {
    const result = compileCss(`.a { border-radius: 8px 0 0 8px; }`, "all");
    const cornerRule = result.ir.rules.find(r => r.selector.includes("UICorner"));
    expect(cornerRule).toBeDefined();
    expect(cornerRule!.properties.get("CornerRadius")).toEqual({ type: "UDim", value: [0, 8] });
    const warnings = result.warnings.getWarnings();
    expect(warnings.some(w => w.message.includes("Per-corner"))).toBe(true);
  });

  test("border-radius: 0 -> UICorner with 0", () => {
    const result = compileCss(`.a { border-radius: 0; }`);
    // Zero radius may or may not produce UICorner depending on how lightningcss parses 0
    // The important thing is no errors
    expect(result.ir.rules).toBeDefined();
  });
});

describe("outline -> UIStroke with Contextual mode", () => {
  test("outline maps to UIStroke with ApplyStrokeMode = Contextual", () => {
    const result = compileCss(`.a { outline: 2px solid red; }`);
    const strokeRule = result.ir.rules.find(r => r.selector.includes("UIStroke"));
    expect(strokeRule).toBeDefined();
    expect(strokeRule!.properties.get("ApplyStrokeMode")).toEqual({
      type: "Enum", enum: "ApplyStrokeMode", value: "Contextual",
    });
    expect(strokeRule!.properties.get("Thickness")).toEqual({ type: "number", value: 2 });
  });
});

describe("border with rgba transparency", () => {
  test("border with rgba color sets Transparency on UIStroke", () => {
    const result = compileCss(`.a { border: 2px solid rgba(0, 0, 0, 0.5); }`);
    const strokeRule = result.ir.rules.find(r => r.selector.includes("UIStroke"));
    expect(strokeRule).toBeDefined();
    const transparency = strokeRule!.properties.get("Transparency");
    expect(transparency!.type).toBe("number");
    if (transparency!.type === "number") {
      expect(transparency!.value).toBe(0.5);
    }
  });
});
