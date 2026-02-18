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

describe("flex properties without display: flex", () => {
  test("flex-direction alone creates UIListLayout (utility-first CSS support)", () => {
    const result = compileCss(`.a { flex-direction: column; }`);
    const layoutRule = result.ir.rules.find(r => r.selector.includes("UIListLayout"));
    expect(layoutRule).toBeDefined();
    expect(layoutRule!.properties.get("FillDirection")).toEqual({
      type: "Enum", enum: "FillDirection", value: "Vertical",
    });
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

describe("justify-content: space-* distribution", () => {
  test("space-between -> HorizontalFlex SpaceBetween (row)", () => {
    const rule = getLayout(`.a { display: flex; justify-content: space-between; }`);
    expect(rule!.properties.get("HorizontalFlex")).toEqual({
      type: "Enum", enum: "UIFlexAlignment", value: "SpaceBetween",
    });
  });

  test("space-around -> HorizontalFlex SpaceAround (row)", () => {
    const rule = getLayout(`.a { display: flex; justify-content: space-around; }`);
    expect(rule!.properties.get("HorizontalFlex")).toEqual({
      type: "Enum", enum: "UIFlexAlignment", value: "SpaceAround",
    });
  });

  test("space-evenly -> HorizontalFlex SpaceEvenly (row)", () => {
    const rule = getLayout(`.a { display: flex; justify-content: space-evenly; }`);
    expect(rule!.properties.get("HorizontalFlex")).toEqual({
      type: "Enum", enum: "UIFlexAlignment", value: "SpaceEvenly",
    });
  });

  test("space-between column -> VerticalFlex SpaceBetween", () => {
    const rule = getLayout(`.a { display: flex; flex-direction: column; justify-content: space-between; }`);
    expect(rule!.properties.get("VerticalFlex")).toEqual({
      type: "Enum", enum: "UIFlexAlignment", value: "SpaceBetween",
    });
  });
});

describe("align-items: stretch", () => {
  test("stretch -> ItemLineAlignment Stretch", () => {
    const rule = getLayout(`.a { display: flex; align-items: stretch; }`);
    expect(rule!.properties.get("ItemLineAlignment")).toEqual({
      type: "Enum", enum: "ItemLineAlignment", value: "Stretch",
    });
  });
});

describe("align-self -> UIFlexItem", () => {
  test("align-self: center", () => {
    const result = compileCss(`.a { align-self: center; }`);
    const flexItem = result.ir.rules.find(r => r.selector.includes("UIFlexItem"));
    expect(flexItem).toBeDefined();
    expect(flexItem!.properties.get("ItemLineAlignment")).toEqual({
      type: "Enum", enum: "ItemLineAlignment", value: "Center",
    });
  });

  test("align-self: stretch", () => {
    const result = compileCss(`.a { align-self: stretch; }`);
    const flexItem = result.ir.rules.find(r => r.selector.includes("UIFlexItem"));
    expect(flexItem).toBeDefined();
    expect(flexItem!.properties.get("ItemLineAlignment")).toEqual({
      type: "Enum", enum: "ItemLineAlignment", value: "Stretch",
    });
  });

  test("align-self combined with flex-grow", () => {
    const result = compileCss(`.a { flex-grow: 1; align-self: end; }`);
    const flexItem = result.ir.rules.find(r => r.selector.includes("UIFlexItem"));
    expect(flexItem).toBeDefined();
    expect(flexItem!.properties.get("GrowRatio")).toEqual({ type: "number", value: 1 });
    expect(flexItem!.properties.get("ItemLineAlignment")).toEqual({
      type: "Enum", enum: "ItemLineAlignment", value: "End",
    });
  });
});

describe("order -> LayoutOrder", () => {
  test("order: 2 maps to LayoutOrder", () => {
    const result = compileCss(`.a { order: 2; }`);
    const rule = result.ir.rules[0];
    expect(rule).toBeDefined();
    expect(rule!.properties.get("LayoutOrder")).toEqual({ type: "number", value: 2 });
  });

  test("order: -1 maps to negative LayoutOrder", () => {
    const result = compileCss(`.a { order: -1; }`);
    const rule = result.ir.rules[0];
    expect(rule!.properties.get("LayoutOrder")).toEqual({ type: "number", value: -1 });
  });
});

describe("flex-basis -> Size", () => {
  test("flex-basis: 200px sets width (default row)", () => {
    const result = compileCss(`.a { flex-basis: 200px; }`);
    const rule = result.ir.rules[0];
    expect(rule).toBeDefined();
    expect(rule!.properties.get("Size")).toEqual({
      type: "UDim2", value: [0, 200, 0, 0],
    });
  });

  test("flex-basis: 100px with column direction sets height", () => {
    const result = compileCss(`.a { flex-direction: column; flex-basis: 100px; }`);
    const rule = result.ir.rules[0];
    expect(rule!.properties.get("Size")).toEqual({
      type: "UDim2", value: [0, 0, 0, 100],
    });
  });

  test("explicit width overrides flex-basis", () => {
    const result = compileCss(`.a { width: 300px; flex-basis: 200px; }`);
    const rule = result.ir.rules[0];
    expect(rule!.properties.get("Size")).toEqual({
      type: "UDim2", value: [0, 300, 0, 0],
    });
  });
});
