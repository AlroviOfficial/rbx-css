import { describe, test, expect } from "bun:test";
import { compileCss } from "../helpers.ts";

function getPadding(css: string) {
  const result = compileCss(css);
  return result.ir.rules.find(r => r.selector.includes("UIPadding"));
}

describe("padding shorthand 3 values", () => {
  test("padding: 10px 20px 30px -> top|horizontal|bottom", () => {
    const rule = getPadding(`.a { padding: 10px 20px 30px; }`);
    expect(rule).toBeDefined();
    expect(rule!.properties.get("PaddingTop")).toEqual({ type: "UDim", value: [0, 10] });
    expect(rule!.properties.get("PaddingRight")).toEqual({ type: "UDim", value: [0, 20] });
    expect(rule!.properties.get("PaddingBottom")).toEqual({ type: "UDim", value: [0, 30] });
    expect(rule!.properties.get("PaddingLeft")).toEqual({ type: "UDim", value: [0, 20] });
  });
});

describe("individual padding sides", () => {
  test("padding-top only", () => {
    const rule = getPadding(`.a { padding-top: 8px; }`);
    expect(rule).toBeDefined();
    expect(rule!.properties.get("PaddingTop")).toEqual({ type: "UDim", value: [0, 8] });
    expect(rule!.properties.has("PaddingBottom")).toBe(false);
  });

  test("padding-left only", () => {
    const rule = getPadding(`.a { padding-left: 16px; }`);
    expect(rule).toBeDefined();
    expect(rule!.properties.get("PaddingLeft")).toEqual({ type: "UDim", value: [0, 16] });
  });

  test("mixed individual padding sides", () => {
    const rule = getPadding(`.a { padding-top: 4px; padding-bottom: 12px; }`);
    expect(rule).toBeDefined();
    expect(rule!.properties.get("PaddingTop")).toEqual({ type: "UDim", value: [0, 4] });
    expect(rule!.properties.get("PaddingBottom")).toEqual({ type: "UDim", value: [0, 12] });
  });
});

describe("padding with percentage", () => {
  test("padding: 10% -> UDim with scale", () => {
    const rule = getPadding(`.a { padding: 10%; }`);
    expect(rule).toBeDefined();
    const top = rule!.properties.get("PaddingTop");
    expect(top!.type).toBe("UDim");
    if (top!.type === "UDim") {
      expect(top!.value[0]).toBeCloseTo(0.1, 2);
      expect(top!.value[1]).toBe(0);
    }
  });
});

describe("padding with var() token", () => {
  test("padding: var(--spacing) creates token references on all sides", () => {
    const result = compileCss(`
      :root { --spacing: 16px; }
      .a { padding: var(--spacing); }
    `);
    const paddingRule = result.ir.rules.find(r => r.selector.includes("UIPadding"));
    expect(paddingRule).toBeDefined();
    for (const side of ["PaddingTop", "PaddingRight", "PaddingBottom", "PaddingLeft"]) {
      expect(paddingRule!.properties.get(side)).toEqual({ type: "token", name: "spacing" });
    }
  });
});
