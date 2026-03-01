import { describe, test, expect } from "bun:test";
import { compileCss } from "../helpers.ts";
import { generateLuau } from "../../src/codegen/luau.ts";

describe("data-theme attribute themes", () => {
  test("single theme extracted", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      [data-theme="dark"] { --bg: #000; }
    `);
    expect(result.ir.themes).toBeDefined();
    expect(result.ir.themes!.has("dark")).toBe(true);
  });

  test("theme tokens override base tokens", () => {
    const result = compileCss(`
      :root { --bg: #fff; --text: #000; }
      [data-theme="dark"] { --bg: #111; --text: #eee; }
    `);
    const dark = result.ir.themes!.get("dark")!;
    expect(dark.tokens.has("bg")).toBe(true);
    expect(dark.tokens.has("text")).toBe(true);
  });

  test("theme can introduce new tokens not in base", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      [data-theme="dark"] { --bg: #000; --accent: #335fff; }
    `);
    const dark = result.ir.themes!.get("dark")!;
    expect(dark.tokens.has("accent")).toBe(true);
    // accent should NOT be in base tokens
    expect(result.ir.tokens.has("accent")).toBe(false);
  });

  test("multiple themes", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      [data-theme="dark"] { --bg: #000; }
      [data-theme="ocean"] { --bg: #006; }
    `);
    expect(result.ir.themes!.has("dark")).toBe(true);
    expect(result.ir.themes!.has("ocean")).toBe(true);
    expect(result.ir.themes!.size).toBe(2);
  });

  test("theme naming uses parent stylesheet name", () => {
    const result = compileCss(
      `:root { --a: #fff; } [data-theme="dark"] { --a: #000; }`,
      { name: "CoreSheet" },
    );
    const dark = result.ir.themes!.get("dark")!;
    expect(dark.name).toBe("CoreSheet_dark");
  });
});

describe("prefers-color-scheme themes", () => {
  test("prefers-color-scheme: dark creates theme", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      @media (prefers-color-scheme: dark) {
        :root { --bg: #000; }
      }
    `);
    expect(result.ir.themes).toBeDefined();
    expect(result.ir.themes!.has("dark")).toBe(true);
    const dark = result.ir.themes!.get("dark")!;
    expect(dark.tokens.has("bg")).toBe(true);
  });

  test("prefers-color-scheme: light creates theme", () => {
    const result = compileCss(`
      :root { --bg: #000; }
      @media (prefers-color-scheme: light) {
        :root { --bg: #fff; }
      }
    `);
    expect(result.ir.themes!.has("light")).toBe(true);
  });

  test("media theme does not pollute base tokens", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      @media (prefers-color-scheme: dark) {
        :root { --bg: #000; --extra: #333; }
      }
    `);
    expect(result.ir.tokens.has("extra")).toBe(false);
    expect(result.ir.tokens.has("bg")).toBe(true);
  });
});

describe("theme Luau codegen", () => {
  test("theme generates themes table", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      [data-theme="dark"] { --bg: #000; }
    `);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain("local themes = {}");
  });

  test("theme generates StyleDerive", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      [data-theme="dark"] { --bg: #000; }
    `);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain("StyleDerive");
    expect(luau).toContain("themeDerive.Parent = sheet");
  });

  test("theme generates setTheme helper", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      [data-theme="dark"] { --bg: #000; }
    `);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain("local function setTheme(themeName: string)");
    expect(luau).toContain("themeDerive.StyleSheet = themes[themeName]");
  });

  test("theme sets attributes on theme sheet", () => {
    const result = compileCss(`
      :root { --bg: #ffffff; }
      [data-theme="dark"] { --bg: #000000; }
    `);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).toContain('theme.Name = "Test_dark"');
    expect(luau).toContain('theme:SetAttribute("bg"');
  });

  test("no themes -> no theme boilerplate", () => {
    const result = compileCss(`.a { color: white; }`);
    const luau = generateLuau(result.ir, { minify: false });
    expect(luau).not.toContain("local themes");
    expect(luau).not.toContain("StyleDerive");
    expect(luau).not.toContain("setTheme");
  });
});

describe("theme rules are filtered from base", () => {
  test("data-theme selectors do not become style rules", () => {
    const result = compileCss(`
      :root { --bg: #fff; }
      [data-theme="dark"] { --bg: #000; }
      .card { color: white; }
    `);
    // Only .card rule should exist, not any data-theme rule
    expect(result.ir.rules.length).toBe(1);
    expect(result.ir.rules[0]!.selector).toBe(".card");
  });
});
