import { describe, test, expect } from "bun:test";
import { compileCss, compileMulti } from "../helpers.ts";
import { generateLuau } from "../../src/codegen/luau.ts";
import { generateRBXMX } from "../../src/codegen/rbxmx.ts";

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
    const result = compileMulti(
      [
        { filename: "tokens.css", content: `:root { --bg: #fff; }` },
        { filename: "rules.css", content: `.card { background-color: var(--bg); }` },
      ],
      { name: "Merged" },
    );
    expect(result.ir.tokens.has("bg")).toBe(true);
    expect(result.ir.rules.length).toBe(1);
    expect(result.ir.rules[0]!.properties.get("BackgroundColor3")).toEqual({
      type: "token", name: "bg",
    });
  });

  test("rules from both files are ordered", () => {
    const result = compileMulti(
      [
        { filename: "a.css", content: `.first { color: white; }` },
        { filename: "b.css", content: `.second { color: black; }` },
      ],
    );
    expect(result.ir.rules[0]!.selector).toBe(".first");
    expect(result.ir.rules[1]!.selector).toBe(".second");
  });

  test("duplicate tokens from later files override", () => {
    const result = compileMulti(
      [
        { filename: "a.css", content: `:root { --bg: #fff; }` },
        { filename: "b.css", content: `:root { --bg: #000; }` },
      ],
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
  test("em unit converts to px (base 16)", () => {
    const result = compileCss(`.a { width: 10em; }`, { warnLevel: "all" });
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size).toEqual({ type: "UDim2", value: [0, 160, 0, 0] });
  });

  test("rem unit converts to px (base 16)", () => {
    const result = compileCss(`.a { width: 10rem; }`, { warnLevel: "all" });
    const size = result.ir.rules[0]!.properties.get("Size");
    expect(size).toEqual({ type: "UDim2", value: [0, 160, 0, 0] });
  });
});

describe("Tailwind v4 integration", () => {
  test("@layer + rem + oklch + flex features compile correctly", () => {
    const css = `
      @layer utilities {
        .p-4 { padding: 1rem; }
        .flex { display: flex; }
        .flex-col { flex-direction: column; }
        .justify-between { justify-content: space-between; }
        .items-stretch { align-items: stretch; }
        .gap-2 { gap: 0.5rem; }
        .grow { flex-grow: 1; }
        .order-1 { order: 1; }
        .bg-red-500 { background-color: oklch(0.637 0.237 25.331); }
        .rounded-lg { border-radius: 0.5rem; }
        .grid { display: grid; }
        .grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
        .w-48 { width: 12rem; }
        .scale-110 { transform: scale(1.1); }
        .rotate-45 { transform: rotate(45deg); }
        .self-center { align-self: center; }
        .basis-40 { flex-basis: 10rem; }
      }
    `;
    const result = compileCss(css, { warnLevel: "none" });

    // Verify padding with rem
    const padding = result.ir.rules.find(r => r.selector === ".p-4::UIPadding");
    expect(padding).toBeDefined();
    expect(padding!.properties.get("PaddingTop")).toEqual({ type: "UDim", value: [0, 16] });

    // Verify flex layout
    const flex = result.ir.rules.find(r => r.selector === ".flex::UIListLayout");
    expect(flex).toBeDefined();

    // Verify space-between
    const jb = result.ir.rules.find(r => r.selector === ".justify-between::UIListLayout");
    expect(jb).toBeDefined();
    // space-between should set HorizontalFlex (default row direction)
    expect(jb!.properties.get("HorizontalFlex")).toEqual({
      type: "Enum", enum: "UIFlexAlignment", value: "SpaceBetween",
    });

    // Verify oklch color
    const bg = result.ir.rules.find(r => r.selector === ".bg-red-500");
    expect(bg).toBeDefined();
    expect(bg!.properties.get("BackgroundColor3")).toEqual({
      type: "Color3", value: [251, 44, 54],
    });

    // Verify rem border-radius
    const corner = result.ir.rules.find(r => r.selector === ".rounded-lg::UICorner");
    expect(corner).toBeDefined();
    expect(corner!.properties.get("CornerRadius")).toEqual({ type: "UDim", value: [0, 8] });

    // Verify grid
    const grid = result.ir.rules.find(r => r.selector === ".grid::UIGridLayout");
    expect(grid).toBeDefined();

    // Verify grid cols
    const gridCols = result.ir.rules.find(r => r.selector === ".grid-cols-3::UIGridLayout");
    expect(gridCols).toBeDefined();
    expect(gridCols!.properties.get("FillDirectionMaxCells")).toEqual({
      type: "number", value: 3,
    });

    // Verify rem width
    const width = result.ir.rules.find(r => r.selector === ".w-48");
    expect(width).toBeDefined();
    expect(width!.properties.get("Size")).toEqual({
      type: "UDim2", value: [0, 192, 0, 0],
    });

    // Verify scale
    const scale = result.ir.rules.find(r => r.selector === ".scale-110::UIScale");
    expect(scale).toBeDefined();

    // Verify rotation
    const rotate = result.ir.rules.find(r => r.selector === ".rotate-45");
    expect(rotate).toBeDefined();
    expect(rotate!.properties.get("Rotation")).toEqual({ type: "number", value: 45 });

    // Verify order
    const order = result.ir.rules.find(r => r.selector === ".order-1");
    expect(order).toBeDefined();
    expect(order!.properties.get("LayoutOrder")).toEqual({ type: "number", value: 1 });

    // Verify align-self
    const selfCenter = result.ir.rules.find(r => r.selector === ".self-center::UIFlexItem");
    expect(selfCenter).toBeDefined();
    expect(selfCenter!.properties.get("ItemLineAlignment")).toEqual({
      type: "Enum", enum: "ItemLineAlignment", value: "Center",
    });

    // Verify flex-basis
    const basis = result.ir.rules.find(r => r.selector === ".basis-40");
    expect(basis).toBeDefined();
    expect(basis!.properties.get("Size")).toEqual({
      type: "UDim2", value: [0, 160, 0, 0],
    });
  });

  test("margin emits helpful warning", () => {
    const result = compileCss(`.a { margin: 1rem; }`, { warnLevel: "all" });
    const warnings = result.warnings.getWarnings();
    expect(warnings.some(w => w.message.includes("gap"))).toBe(true);
  });
});
