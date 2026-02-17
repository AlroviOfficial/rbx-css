import { describe, test, expect } from "bun:test";
import { compile } from "../../src/compiler.ts";

function compileCss(css: string, warnLevel: "all" | "none" = "none") {
  return compile(
    [{ filename: "test.css", content: css }],
    { name: "Test", warnLevel, strict: false },
  );
}

describe("element mapping", () => {
  test("p -> TextLabel", () => {
    const result = compileCss(`p { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("TextLabel");
  });

  test("h1 through h6 -> TextLabel", () => {
    for (let i = 1; i <= 6; i++) {
      const result = compileCss(`h${i} { color: white; }`);
      expect(result.ir.rules[0]!.selector).toBe("TextLabel");
    }
  });

  test("a -> TextButton", () => {
    const result = compileCss(`a { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("TextButton");
  });

  test("canvas -> ViewportFrame", () => {
    const result = compileCss(`canvas { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("ViewportFrame");
  });

  test("unknown element passes through with warning", () => {
    const result = compileCss(`foobar { color: white; }`, "all");
    expect(result.ir.rules[0]!.selector).toBe("foobar");
    expect(result.warnings.getWarnings().some(w => w.code === "unsupported-selector")).toBe(true);
  });

  test("Roblox classes pass through", () => {
    for (const cls of ["Frame", "TextLabel", "TextButton", "TextBox", "ImageLabel", "ImageButton", "ScrollingFrame", "ViewportFrame"]) {
      const result = compileCss(`${cls} { color: white; }`);
      expect(result.ir.rules[0]!.selector).toBe(cls);
    }
  });
});

describe("ID selector", () => {
  test("#name maps to Roblox name selector", () => {
    const result = compileCss(`#sidebar { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("#sidebar");
  });
});

describe("pseudo-class mapping", () => {
  test(":focus -> :NonDefault", () => {
    const result = compileCss(`.a:focus { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe(".a:NonDefault");
  });

  test(":disabled -> :NonDefault", () => {
    const result = compileCss(`.a:disabled { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe(".a:NonDefault");
  });

  test("unsupported pseudo-class emits warning", () => {
    const result = compileCss(`.a:first-child { color: white; }`, "all");
    const warnings = result.warnings.getWarnings();
    expect(warnings.some(w => w.message.includes("first-child"))).toBe(true);
  });
});

describe("combinator edge cases", () => {
  test("deeply nested child combinator: .a > .b > .c", () => {
    const result = compileCss(`.a > .b > .c { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe(".a > .b > .c");
  });

  test("mixed child and descendant: .a > .b .c", () => {
    const result = compileCss(`.a > .b .c { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe(".a > .b .c");
  });

  test("universal selector * warns and is skipped", () => {
    const result = compileCss(`* { color: white; }`, "all");
    expect(result.ir.rules.length).toBe(0);
    expect(result.warnings.getWarnings().some(w => w.message.includes("Universal"))).toBe(true);
  });
});

describe("compound selectors", () => {
  test("element.class with multiple classes", () => {
    const result = compileCss(`div.card { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("Frame.card");
  });

  test("class + hover combined", () => {
    const result = compileCss(`.btn:hover { color: red; }`);
    expect(result.ir.rules[0]!.selector).toBe(".btn:Hover");
  });

  test("element.class:hover compound", () => {
    const result = compileCss(`button.primary:hover { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("TextButton.primary:Hover");
  });

  test("child combinator with element mapping on both sides", () => {
    const result = compileCss(`div > span { color: white; }`);
    expect(result.ir.rules[0]!.selector).toBe("Frame > TextLabel");
  });
});

describe("multiple selectors per rule", () => {
  test(".a, .b produces two rules", () => {
    const result = compileCss(`.a, .b { color: white; }`);
    expect(result.ir.rules.length).toBe(2);
    const selectors = result.ir.rules.map(r => r.selector);
    expect(selectors).toContain(".a");
    expect(selectors).toContain(".b");
  });

  test("element, .class produces mapped rules", () => {
    const result = compileCss(`div, .card { color: white; }`);
    const selectors = result.ir.rules.map(r => r.selector);
    expect(selectors).toContain("Frame");
    expect(selectors).toContain(".card");
  });
});
