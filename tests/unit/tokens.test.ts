import { describe, test, expect } from "bun:test";
import { compileCss } from "../helpers.ts";
import { generateLuau } from "../../src/codegen/luau.ts";

describe("token type inference", () => {
  test("color token from hex", () => {
    const result = compileCss(`:root { --accent: #ff6600; }`);
    const token = result.ir.tokens.get("accent");
    expect(token).toBeDefined();
    expect(token!.type).toBe("Color3");
  });

  test("UDim token from px", () => {
    const result = compileCss(`:root { --space: 16px; }`);
    const token = result.ir.tokens.get("space");
    expect(token).toBeDefined();
    expect(token!.type).toBe("UDim");
    if (token!.type === "UDim") {
      expect(token!.value).toEqual([0, 16]);
    }
  });

  test("number token", () => {
    const result = compileCss(`:root { --scale: 1.5; }`);
    const token = result.ir.tokens.get("scale");
    expect(token).toBeDefined();
    expect(token!.type).toBe("number");
    if (token!.type === "number") {
      expect(token!.value).toBe(1.5);
    }
  });

  test("string token from quoted value", () => {
    const result = compileCss(`:root { --font: "GothamSSm"; }`);
    const token = result.ir.tokens.get("font");
    expect(token).toBeDefined();
    expect(token!.type).toBe("string");
    if (token!.type === "string") {
      expect(token!.value).toBe("GothamSSm");
    }
  });

  test("token name strips -- prefix", () => {
    const result = compileCss(`:root { --my-var: #000; }`);
    expect(result.ir.tokens.has("my-var")).toBe(true);
    expect(result.ir.tokens.has("--my-var")).toBe(false);
  });
});

describe("token references via var()", () => {
  test("var() in background-color -> BackgroundColor3 token ref", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      .a { background-color: var(--bg); }
    `);
    expect(result.ir.rules[0]!.properties.get("BackgroundColor3")).toEqual({
      type: "token", name: "bg",
    });
  });

  test("var() in color -> TextColor3 token ref", () => {
    const result = compileCss(`
      :root { --text: #000; }
      .a { color: var(--text); }
    `);
    expect(result.ir.rules[0]!.properties.get("TextColor3")).toEqual({
      type: "token", name: "text",
    });
  });

  test("var() in border-radius -> UICorner with token ref", () => {
    const result = compileCss(`
      :root { --r: 8px; }
      .a { border-radius: var(--r); }
    `);
    const cornerRule = result.ir.rules.find(r => r.selector.includes("UICorner"));
    expect(cornerRule).toBeDefined();
    expect(cornerRule!.properties.get("CornerRadius")).toEqual({
      type: "token", name: "r",
    });
  });

  test("var() in gap -> UIListLayout with token ref", () => {
    const result = compileCss(`
      :root { --gap: 8px; }
      .a { display: flex; gap: var(--gap); }
    `);
    const layoutRule = result.ir.rules.find(r => r.selector.includes("UIListLayout"));
    expect(layoutRule).toBeDefined();
    expect(layoutRule!.properties.get("Padding")).toEqual({
      type: "token", name: "gap",
    });
  });

  test("var() in font-size -> TextSize token ref", () => {
    const result = compileCss(`
      :root { --size: 16; }
      .a { font-size: var(--size); }
    `);
    expect(result.ir.rules[0]!.properties.get("TextSize")).toEqual({
      type: "token", name: "size",
    });
  });
});

describe("token Luau serialization", () => {
  test("Color3 token uses fromHex", () => {
    const result = compileCss(`:root { --c: #335fff; }`);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain('sheet:SetAttribute("c", Color3.fromHex("#335fff"))');
  });

  test("UDim token uses UDim.new", () => {
    const result = compileCss(`:root { --r: 8px; }`);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain('sheet:SetAttribute("r", UDim.new(0, 8))');
  });

  test("token reference in rule uses $ prefix", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      .a { background-color: var(--bg); }
    `);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain('"$bg"');
  });
});

describe("multiple tokens", () => {
  test("many tokens in :root all extracted", () => {
    const result = compileCss(`
      :root {
        --a: #111;
        --b: #222;
        --c: #333;
        --d: 4px;
        --e: 5px;
      }
    `);
    expect(result.ir.tokens.size).toBe(5);
    expect(result.ir.tokens.has("a")).toBe(true);
    expect(result.ir.tokens.has("e")).toBe(true);
  });
});

describe("tokens not polluted by non-root rules", () => {
  test("custom properties in non-root rules are not tokens", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      .a { background-color: var(--bg); }
    `);
    expect(result.ir.tokens.size).toBe(1);
    expect(result.ir.tokens.has("bg")).toBe(true);
  });
});
