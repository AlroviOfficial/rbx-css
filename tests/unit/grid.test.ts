import { describe, test, expect } from "bun:test";
import { compileCss } from "../helpers.ts";
import { generateLuau } from "../../src/codegen/luau.ts";

function getGrid(css: string) {
  const result = compileCss(css);
  return result.ir.rules.find((r) => r.selector.includes("UIGridLayout"));
}

describe("display: grid", () => {
  test("produces UIGridLayout pseudo-instance", () => {
    const grid = getGrid(`.container { display: grid; }`);
    expect(grid).toBeDefined();
    expect(grid!.selector).toBe(".container::UIGridLayout");
  });
});

describe("grid-template-columns", () => {
  test("repeat(3, 1fr) sets FillDirectionMaxCells to 3", () => {
    const grid = getGrid(
      `.g { display: grid; grid-template-columns: repeat(3, 1fr); }`,
    );
    expect(grid).toBeDefined();
    expect(grid!.properties.get("FillDirectionMaxCells")).toEqual({
      type: "number",
      value: 3,
    });
  });

  test("repeat(4, 100px) sets FillDirectionMaxCells and CellSize width", () => {
    const grid = getGrid(
      `.g { display: grid; grid-template-columns: repeat(4, 100px); }`,
    );
    expect(grid).toBeDefined();
    expect(grid!.properties.get("FillDirectionMaxCells")).toEqual({
      type: "number",
      value: 4,
    });
    const cellSize = grid!.properties.get("CellSize");
    expect(cellSize).toBeDefined();
    // Width = 100px offset, height = default 100px
    expect(cellSize).toEqual({
      type: "UDim2",
      value: [0, 100, 0, 100],
    });
  });

  test("explicit column list counts columns", () => {
    const grid = getGrid(
      `.g { display: grid; grid-template-columns: 100px 200px 100px; }`,
    );
    expect(grid).toBeDefined();
    expect(grid!.properties.get("FillDirectionMaxCells")).toEqual({
      type: "number",
      value: 3,
    });
  });
});

describe("grid-template-rows", () => {
  test("repeat(2, 150px) sets CellSize height", () => {
    const grid = getGrid(
      `.g { display: grid; grid-template-columns: repeat(3, 100px); grid-template-rows: repeat(2, 150px); }`,
    );
    expect(grid).toBeDefined();
    const cellSize = grid!.properties.get("CellSize");
    expect(cellSize).toEqual({
      type: "UDim2",
      value: [0, 100, 0, 150],
    });
  });
});

describe("grid gap", () => {
  test("gap sets CellPadding", () => {
    const grid = getGrid(`.g { display: grid; gap: 8px; }`);
    expect(grid).toBeDefined();
    expect(grid!.properties.get("CellPadding")).toEqual({
      type: "UDim2",
      value: [0, 8, 0, 8],
    });
  });

  test("gap with rem units", () => {
    const grid = getGrid(`.g { display: grid; gap: 1rem; }`);
    expect(grid).toBeDefined();
    expect(grid!.properties.get("CellPadding")).toEqual({
      type: "UDim2",
      value: [0, 16, 0, 16],
    });
  });
});

describe("grid Luau output", () => {
  test("generates UIGridLayout selector in Luau", () => {
    const result = compileCss(
      `.cards { display: grid; grid-template-columns: repeat(3, 100px); gap: 8px; }`,
    );
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain('rule.Selector = ".cards::UIGridLayout"');
    expect(luau).toContain("FillDirectionMaxCells = 3");
    expect(luau).toContain("CellPadding = UDim2.new(0, 8, 0, 8)");
    expect(luau).toContain("CellSize = UDim2.new(0, 100, 0, 100)");
  });
});
