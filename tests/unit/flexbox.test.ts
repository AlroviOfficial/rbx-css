import { describe, test, expect } from "bun:test";
import { compile } from "../../src/compiler.ts";

function compileCss(css: string) {
  return compile(
    [{ filename: "test.css", content: css }],
    { name: "Test", warnLevel: "none", strict: false },
  );
}

function getLayout(css: string) {
  const result = compileCss(css);
  return result.ir.rules.find(r => r.selector.includes("UIListLayout"));
}

describe("flex-direction", () => {
  test("row -> Horizontal", () => {
    const rule = getLayout(`.a { display: flex; flex-direction: row; }`);
    expect(rule).toBeDefined();
    expect(rule!.properties.get("FillDirection")).toEqual({
      type: "Enum", enum: "FillDirection", value: "Horizontal",
    });
  });

  test("column -> Vertical", () => {
    const rule = getLayout(`.a { display: flex; flex-direction: column; }`);
    expect(rule!.properties.get("FillDirection")).toEqual({
      type: "Enum", enum: "FillDirection", value: "Vertical",
    });
  });

  test("row-reverse -> Horizontal", () => {
    const rule = getLayout(`.a { display: flex; flex-direction: row-reverse; }`);
    expect(rule!.properties.get("FillDirection")).toEqual({
      type: "Enum", enum: "FillDirection", value: "Horizontal",
    });
  });

  test("default (no flex-direction) -> Horizontal (row is default)", () => {
    const rule = getLayout(`.a { display: flex; }`);
    expect(rule!.properties.get("FillDirection")).toEqual({
      type: "Enum", enum: "FillDirection", value: "Horizontal",
    });
  });
});

describe("justify-content with row direction", () => {
  test("flex-start -> HorizontalAlignment.Left", () => {
    const rule = getLayout(`.a { display: flex; justify-content: flex-start; }`);
    expect(rule!.properties.get("HorizontalAlignment")).toEqual({
      type: "Enum", enum: "HorizontalAlignment", value: "Left",
    });
  });

  test("center -> HorizontalAlignment.Center", () => {
    const rule = getLayout(`.a { display: flex; justify-content: center; }`);
    expect(rule!.properties.get("HorizontalAlignment")).toEqual({
      type: "Enum", enum: "HorizontalAlignment", value: "Center",
    });
  });

  test("flex-end -> HorizontalAlignment.Right", () => {
    const rule = getLayout(`.a { display: flex; justify-content: flex-end; }`);
    expect(rule!.properties.get("HorizontalAlignment")).toEqual({
      type: "Enum", enum: "HorizontalAlignment", value: "Right",
    });
  });
});

describe("justify-content with column direction", () => {
  test("center with column -> VerticalAlignment.Center", () => {
    const rule = getLayout(`.a { display: flex; flex-direction: column; justify-content: center; }`);
    expect(rule!.properties.get("VerticalAlignment")).toEqual({
      type: "Enum", enum: "VerticalAlignment", value: "Center",
    });
  });

  test("flex-end with column -> VerticalAlignment.Bottom", () => {
    const rule = getLayout(`.a { display: flex; flex-direction: column; justify-content: flex-end; }`);
    expect(rule!.properties.get("VerticalAlignment")).toEqual({
      type: "Enum", enum: "VerticalAlignment", value: "Bottom",
    });
  });
});

describe("align-items with row direction", () => {
  test("center -> VerticalAlignment.Center (cross-axis)", () => {
    const rule = getLayout(`.a { display: flex; align-items: center; }`);
    expect(rule!.properties.get("VerticalAlignment")).toEqual({
      type: "Enum", enum: "VerticalAlignment", value: "Center",
    });
  });

  test("flex-start -> VerticalAlignment.Top (cross-axis)", () => {
    const rule = getLayout(`.a { display: flex; align-items: flex-start; }`);
    expect(rule!.properties.get("VerticalAlignment")).toEqual({
      type: "Enum", enum: "VerticalAlignment", value: "Top",
    });
  });

  test("flex-end -> VerticalAlignment.Bottom (cross-axis)", () => {
    const rule = getLayout(`.a { display: flex; align-items: flex-end; }`);
    expect(rule!.properties.get("VerticalAlignment")).toEqual({
      type: "Enum", enum: "VerticalAlignment", value: "Bottom",
    });
  });
});

describe("align-items with column direction", () => {
  test("center with column -> HorizontalAlignment.Center (cross-axis)", () => {
    const rule = getLayout(`.a { display: flex; flex-direction: column; align-items: center; }`);
    expect(rule!.properties.get("HorizontalAlignment")).toEqual({
      type: "Enum", enum: "HorizontalAlignment", value: "Center",
    });
  });
});

describe("flex-wrap", () => {
  test("wrap -> Wraps = true", () => {
    const rule = getLayout(`.a { display: flex; flex-wrap: wrap; }`);
    expect(rule!.properties.get("Wraps")).toEqual({ type: "boolean", value: true });
  });

  test("nowrap -> no Wraps property", () => {
    const rule = getLayout(`.a { display: flex; flex-wrap: nowrap; }`);
    expect(rule!.properties.has("Wraps")).toBe(false);
  });

  test("wrap-reverse -> Wraps = true", () => {
    const rule = getLayout(`.a { display: flex; flex-wrap: wrap-reverse; }`);
    expect(rule!.properties.get("Wraps")).toEqual({ type: "boolean", value: true });
  });
});

describe("gap", () => {
  test("gap in px -> Padding UDim", () => {
    const rule = getLayout(`.a { display: flex; gap: 16px; }`);
    expect(rule!.properties.get("Padding")).toEqual({ type: "UDim", value: [0, 16] });
  });
});

describe("flex-grow/shrink -> UIFlexItem", () => {
  test("flex-grow only", () => {
    const result = compileCss(`.a { flex-grow: 2; }`);
    const flexRule = result.ir.rules.find(r => r.selector.includes("UIFlexItem"));
    expect(flexRule).toBeDefined();
    expect(flexRule!.properties.get("GrowRatio")).toEqual({ type: "number", value: 2 });
    expect(flexRule!.properties.get("FlexMode")).toEqual({
      type: "Enum", enum: "UIFlexMode", value: "Custom",
    });
  });

  test("flex-shrink only", () => {
    const result = compileCss(`.a { flex-shrink: 0.5; }`);
    const flexRule = result.ir.rules.find(r => r.selector.includes("UIFlexItem"));
    expect(flexRule).toBeDefined();
    expect(flexRule!.properties.get("ShrinkRatio")).toEqual({ type: "number", value: 0.5 });
  });

  test("flex-grow: 0 still emits UIFlexItem", () => {
    const result = compileCss(`.a { flex-grow: 0; }`);
    const flexRule = result.ir.rules.find(r => r.selector.includes("UIFlexItem"));
    expect(flexRule).toBeDefined();
    expect(flexRule!.properties.get("GrowRatio")).toEqual({ type: "number", value: 0 });
  });
});

describe("display: flex without display", () => {
  test("flex-direction alone does NOT create UIListLayout (needs display: flex)", () => {
    const result = compileCss(`.a { flex-direction: column; }`);
    const layoutRule = result.ir.rules.find(r => r.selector.includes("UIListLayout"));
    expect(layoutRule).toBeUndefined();
  });
});

describe("combined justify + align", () => {
  test("both set on row flex", () => {
    const rule = getLayout(`.a {
      display: flex;
      justify-content: center;
      align-items: flex-end;
    }`);
    expect(rule!.properties.get("HorizontalAlignment")).toEqual({
      type: "Enum", enum: "HorizontalAlignment", value: "Center",
    });
    expect(rule!.properties.get("VerticalAlignment")).toEqual({
      type: "Enum", enum: "VerticalAlignment", value: "Bottom",
    });
  });
});
