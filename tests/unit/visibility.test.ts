import { describe, test, expect } from "bun:test";
import { compileCss } from "../helpers.ts";

describe("display", () => {
  test("display: none -> Visible = false", () => {
    const result = compileCss(`.a { display: none; }`);
    expect(result.ir.rules[0]!.properties.get("Visible")).toEqual({
      type: "boolean", value: false,
    });
  });

  test("display: flex does NOT set Visible = false", () => {
    const result = compileCss(`.a { display: flex; }`);
    expect(result.ir.rules[0]?.properties.has("Visible")).toBeFalsy();
  });
});

describe("visibility", () => {
  test("visibility: hidden -> Visible = false", () => {
    const result = compileCss(`.a { visibility: hidden; }`);
    expect(result.ir.rules[0]!.properties.get("Visible")).toEqual({
      type: "boolean", value: false,
    });
  });

  test("visibility: visible does not produce Visible property", () => {
    const result = compileCss(`.a { visibility: visible; }`);
    expect(result.ir.rules.length).toBe(0); // no properties to emit
  });
});

describe("overflow", () => {
  test("overflow: hidden -> ClipsDescendants = true", () => {
    const result = compileCss(`.a { overflow: hidden; }`);
    expect(result.ir.rules[0]!.properties.get("ClipsDescendants")).toEqual({
      type: "boolean", value: true,
    });
  });

  test("overflow-x: hidden also triggers ClipsDescendants", () => {
    // lightningcss normalizes overflow-x to overflow shorthand
    const result = compileCss(`.a { overflow: hidden visible; }`);
    expect(result.ir.rules[0]!.properties.get("ClipsDescendants")).toEqual({
      type: "boolean", value: true,
    });
  });
});

describe("text properties", () => {
  test("text-align: left", () => {
    const result = compileCss(`.a { text-align: left; }`);
    expect(result.ir.rules[0]!.properties.get("TextXAlignment")).toEqual({
      type: "Enum", enum: "TextXAlignment", value: "Left",
    });
  });

  test("text-align: right", () => {
    const result = compileCss(`.a { text-align: right; }`);
    expect(result.ir.rules[0]!.properties.get("TextXAlignment")).toEqual({
      type: "Enum", enum: "TextXAlignment", value: "Right",
    });
  });

  test("vertical-align: top", () => {
    const result = compileCss(`.a { vertical-align: top; }`);
    expect(result.ir.rules[0]!.properties.get("TextYAlignment")).toEqual({
      type: "Enum", enum: "TextYAlignment", value: "Top",
    });
  });

  test("vertical-align: middle -> Center", () => {
    const result = compileCss(`.a { vertical-align: middle; }`);
    expect(result.ir.rules[0]!.properties.get("TextYAlignment")).toEqual({
      type: "Enum", enum: "TextYAlignment", value: "Center",
    });
  });

  test("vertical-align: bottom", () => {
    const result = compileCss(`.a { vertical-align: bottom; }`);
    expect(result.ir.rules[0]!.properties.get("TextYAlignment")).toEqual({
      type: "Enum", enum: "TextYAlignment", value: "Bottom",
    });
  });

  test("overflow-wrap: break-word -> TextWrapped = true", () => {
    const result = compileCss(`.a { overflow-wrap: break-word; }`);
    expect(result.ir.rules[0]!.properties.get("TextWrapped")).toEqual({
      type: "boolean", value: true,
    });
  });

  test("line-height: 2", () => {
    const result = compileCss(`.a { line-height: 2; }`);
    expect(result.ir.rules[0]!.properties.get("LineHeight")).toEqual({
      type: "number", value: 2,
    });
  });
});
