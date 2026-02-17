import { describe, test, expect } from "bun:test";
import { compile } from "../../src/compiler.ts";
import { generateLuau } from "../../src/codegen/luau.ts";
import { generateRBXMX } from "../../src/codegen/rbxmx.ts";

function compileCss(css: string, opts?: { name?: string; strict?: boolean; warnLevel?: "all" | "none" }) {
  return compile(
    [{ filename: "test.css", content: css }],
    {
      name: opts?.name ?? "Test",
      warnLevel: opts?.warnLevel ?? "none",
      strict: opts?.strict ?? false,
    },
  );
}

describe("rules with only pseudo-instances (no direct properties)", () => {
  test("border-radius-only rule produces UICorner rule", () => {
    const result = compileCss(`.a { border-radius: 8px; }`);
    expect(result.ir.rules.length).toBe(1);
    expect(result.ir.rules[0]!.selector).toBe(".a::UICorner");
  });

  test("padding-only rule produces UIPadding rule", () => {
    const result = compileCss(`.a { padding: 16px; }`);
    expect(result.ir.rules.length).toBe(1);
    expect(result.ir.rules[0]!.selector).toBe(".a::UIPadding");
  });

  test("flex-only rule produces UIListLayout rule", () => {
    const result = compileCss(`.a { display: flex; flex-direction: column; }`);
    expect(result.ir.rules.length).toBe(1);
    expect(result.ir.rules[0]!.selector).toBe(".a::UIListLayout");
  });
});

describe("multiple pseudo-instances from one rule", () => {
  test("border + padding + border-radius = UIStroke + UIPadding + UICorner", () => {
    const result = compileCss(`.a {
      border: 2px solid #333;
      padding: 8px;
      border-radius: 4px;
    }`);
    const selectors = result.ir.rules.map(r => r.selector);
    expect(selectors).toContain(".a::UICorner");
    expect(selectors).toContain(".a::UIStroke");
    expect(selectors).toContain(".a::UIPadding");
  });

  test("pseudo-instances inherit parent selector", () => {
    const result = compileCss(`button.primary { border-radius: 6px; padding: 8px 16px; }`);
    const selectors = result.ir.rules.map(r => r.selector);
    expect(selectors).toContain("TextButton.primary::UICorner");
    expect(selectors).toContain("TextButton.primary::UIPadding");
  });

  test("pseudo-instances with hover selector", () => {
    // Hover rules typically set direct properties, but if they had
    // padding it would be .card:Hover::UIPadding (unusual but valid)
    const result = compileCss(`.card:hover { padding: 20px; }`);
    expect(result.ir.rules[0]!.selector).toBe(".card:Hover::UIPadding");
  });
});

describe("CSS with only unsupported properties", () => {
  test("produces empty ruleset with warnings", () => {
    const result = compileCss(`.a {
      box-shadow: 0 0 10px black;
      text-decoration: underline;
    }`, { warnLevel: "all" });
    expect(result.ir.rules.length).toBe(0);
    expect(result.warnings.getWarnings().length).toBeGreaterThan(0);
  });
});

describe("empty CSS", () => {
  test("empty string -> empty IR", () => {
    const result = compileCss("");
    expect(result.ir.tokens.size).toBe(0);
    expect(result.ir.rules.length).toBe(0);
    expect(result.ir.themes).toBeUndefined();
  });

  test("comments only -> empty IR", () => {
    const result = compileCss("/* just a comment */");
    expect(result.ir.rules.length).toBe(0);
  });
});

describe("multi-file compilation", () => {
  test("tokens from first file, rules from second", () => {
    const result = compile(
      [
        { filename: "tokens.css", content: `:root { --bg: #fff; }` },
        { filename: "rules.css", content: `.card { background-color: var(--bg); }` },
      ],
      { name: "Merged", warnLevel: "none", strict: false },
    );
    expect(result.ir.tokens.has("bg")).toBe(true);
    expect(result.ir.rules.length).toBe(1);
    expect(result.ir.rules[0]!.properties.get("BackgroundColor3")).toEqual({
      type: "token", name: "bg",
    });
  });

  test("rules from both files are ordered", () => {
    const result = compile(
      [
        { filename: "a.css", content: `.first { color: white; }` },
        { filename: "b.css", content: `.second { color: black; }` },
      ],
      { name: "M", warnLevel: "none", strict: false },
    );
    expect(result.ir.rules[0]!.selector).toBe(".first");
    expect(result.ir.rules[1]!.selector).toBe(".second");
  });

  test("duplicate tokens from later files override", () => {
    const result = compile(
      [
        { filename: "a.css", content: `:root { --bg: #fff; }` },
        { filename: "b.css", content: `:root { --bg: #000; }` },
      ],
      { name: "M", warnLevel: "none", strict: false },
    );
    // Later file should win
    const token = result.ir.tokens.get("bg")!;
    expect(token.type).toBe("Color3");
    if (token.type === "Color3") {
      expect(token.value).toEqual([0, 0, 0]);
    }
  });
});

describe("complex real-world CSS", () => {
  test("navbar component", () => {
    const css = `
      :root {
        --nav-bg: #1a1a2e;
        --nav-height: 48px;
      }

      .navbar {
        background-color: var(--nav-bg);
        width: 100%;
        height: var(--nav-height);
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        padding: 0 16px;
      }

      .navbar > .logo {
        width: auto;
        height: 32px;
      }

      .navbar > .nav-item {
        color: white;
        font-size: 14px;
        font-family: "GothamSSm";
        padding: 8px 12px;
      }

      .navbar > .nav-item:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }
    `;

    const result = compileCss(css);
    expect(result.ir.tokens.has("nav-bg")).toBe(true);
    expect(result.ir.tokens.has("nav-height")).toBe(true);

    const selectors = result.ir.rules.map(r => r.selector);
    expect(selectors).toContain(".navbar");
    expect(selectors).toContain(".navbar::UIListLayout");
    expect(selectors).toContain(".navbar::UIPadding");
    expect(selectors).toContain(".navbar > .logo");
    expect(selectors).toContain(".navbar > .nav-item");
    expect(selectors).toContain(".navbar > .nav-item::UIPadding");
    expect(selectors).toContain(".navbar > .nav-item:Hover");

    // Luau output should be valid
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain("createStyleSheet");
    expect(luau).toContain('"$nav-bg"');

    // RBXMX output should be valid
    const rbxmx = generateRBXMX(result.ir);
    expect(rbxmx).toContain('<roblox version="4">');
    expect(rbxmx).toContain(".navbar");
  });

  test("card grid layout", () => {
    const css = `
      .grid {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 12px;
        padding: 20px;
      }

      .grid > .card {
        width: 200px;
        height: auto;
        background-color: #2a2a3e;
        border-radius: 12px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .grid > .card > .title {
        color: #e1e1e1;
        font-size: 20px;
        font-weight: 700;
        font-family: "GothamSSm";
      }

      .grid > .card > .body {
        color: #aaa;
        font-size: 14px;
        word-wrap: break-word;
      }

      .grid > .card:hover {
        background-color: #3a3a4e;
      }
    `;

    const result = compileCss(css);
    const selectors = result.ir.rules.map(r => r.selector);

    // Grid layout
    expect(selectors).toContain(".grid::UIListLayout");
    expect(selectors).toContain(".grid::UIPadding");

    // Card with auto height
    expect(selectors).toContain(".grid > .card");
    expect(selectors).toContain(".grid > .card::UICorner");
    expect(selectors).toContain(".grid > .card::UIPadding");
    expect(selectors).toContain(".grid > .card::UIListLayout");

    // Card children
    expect(selectors).toContain(".grid > .card > .title");
    expect(selectors).toContain(".grid > .card > .body");

    // Hover
    expect(selectors).toContain(".grid > .card:Hover");

    // Card should have AutomaticSize.Y
    const cardRule = result.ir.rules.find(r => r.selector === ".grid > .card");
    expect(cardRule!.properties.get("AutomaticSize")).toEqual({
      type: "Enum", enum: "AutomaticSize", value: "Y",
    });
  });
});

describe("combined properties and pseudo-instances", () => {
  test("rule with both direct props and pseudo-instances", () => {
    const result = compileCss(`.a {
      background-color: #333;
      color: white;
      font-size: 14px;
      border-radius: 8px;
      padding: 10px;
      border: 1px solid #555;
    }`);

    // Direct properties rule
    const mainRule = result.ir.rules.find(r => r.selector === ".a");
    expect(mainRule).toBeDefined();
    expect(mainRule!.properties.has("BackgroundColor3")).toBe(true);
    expect(mainRule!.properties.has("TextColor3")).toBe(true);
    expect(mainRule!.properties.has("TextSize")).toBe(true);

    // Pseudo-instance rules
    expect(result.ir.rules.find(r => r.selector === ".a::UICorner")).toBeDefined();
    expect(result.ir.rules.find(r => r.selector === ".a::UIPadding")).toBeDefined();
    expect(result.ir.rules.find(r => r.selector === ".a::UIStroke")).toBeDefined();
  });
});

describe("units edge cases", () => {
  test("unsupported unit em emits warning", () => {
    const result = compileCss(`.a { width: 10em; }`, { warnLevel: "all" });
    expect(result.warnings.getWarnings().some(w => w.code === "unsupported-unit")).toBe(true);
  });

  test("unsupported unit rem emits warning", () => {
    const result = compileCss(`.a { width: 10rem; }`, { warnLevel: "all" });
    expect(result.warnings.getWarnings().some(w => w.code === "unsupported-unit")).toBe(true);
  });
});
