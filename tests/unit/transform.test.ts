import { describe, test, expect } from "bun:test";
import { compile } from "../../src/compiler.ts";

function compileCss(css: string, warnLevel: "all" | "none" = "none") {
  return compile(
    [{ filename: "test.css", content: css }],
    { name: "Test", warnLevel, strict: false },
  );
}

describe("transform: scale()", () => {
  test("scale(1.5) produces UIScale pseudo-instance", () => {
    const result = compileCss(`.a { transform: scale(1.5); }`);
    const scaleRule = result.ir.rules.find((r) =>
      r.selector.includes("UIScale"),
    );
    expect(scaleRule).toBeDefined();
    const scale = scaleRule!.properties.get("Scale");
    expect(scale).toBeDefined();
    expect(scale!.type).toBe("number");
    expect((scale as { type: "number"; value: number }).value).toBeCloseTo(
      1.5,
      1,
    );
  });

  test("scale(0.5) produces UIScale with 0.5", () => {
    const result = compileCss(`.a { transform: scale(0.5); }`);
    const scaleRule = result.ir.rules.find((r) =>
      r.selector.includes("UIScale"),
    );
    expect(scaleRule).toBeDefined();
    const scale = scaleRule!.properties.get("Scale");
    expect((scale as { type: "number"; value: number }).value).toBeCloseTo(
      0.5,
      1,
    );
  });
});

describe("transform: rotate()", () => {
  test("rotate(45deg) produces Rotation property", () => {
    const result = compileCss(`.a { transform: rotate(45deg); }`);
    const rule = result.ir.rules.find((r) => !r.selector.includes("::"));
    expect(rule).toBeDefined();
    expect(rule!.properties.get("Rotation")).toEqual({
      type: "number",
      value: 45,
    });
  });

  test("rotate(90deg) produces Rotation = 90", () => {
    const result = compileCss(`.a { transform: rotate(90deg); }`);
    const rule = result.ir.rules.find((r) => !r.selector.includes("::"));
    expect(rule!.properties.get("Rotation")).toEqual({
      type: "number",
      value: 90,
    });
  });
});

describe("combined transforms", () => {
  test("scale and rotate together produce both UIScale and Rotation", () => {
    const result = compileCss(
      `.a { transform: scale(0.5) rotate(90deg); }`,
    );
    const scaleRule = result.ir.rules.find((r) =>
      r.selector.includes("UIScale"),
    );
    expect(scaleRule).toBeDefined();

    const directRule = result.ir.rules.find((r) => !r.selector.includes("::"));
    expect(directRule).toBeDefined();
    expect(directRule!.properties.get("Rotation")).toEqual({
      type: "number",
      value: 90,
    });
  });
});

describe("unsupported transforms", () => {
  test("skew emits warning", () => {
    const result = compileCss(`.a { transform: skewX(10deg); }`, "all");
    const warnings = result.warnings.getWarnings();
    expect(
      warnings.some((w) => w.message.includes("skewX")),
    ).toBe(true);
  });

  test("translate emits warning", () => {
    const result = compileCss(`.a { transform: translateX(10px); }`, "all");
    const warnings = result.warnings.getWarnings();
    expect(
      warnings.some((w) => w.message.includes("translateX")),
    ).toBe(true);
  });
});
