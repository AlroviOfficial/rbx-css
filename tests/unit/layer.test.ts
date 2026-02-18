import { describe, test, expect } from "bun:test";
import { compile } from "../../src/compiler.ts";
import { parseCSS } from "../../src/parser/css-parser.ts";

function compileCss(css: string, warnLevel: "all" | "none" = "none") {
  return compile(
    [{ filename: "test.css", content: css }],
    { name: "Test", warnLevel, strict: false },
  );
}

describe("@layer unwrapping", () => {
  test("rules inside @layer are extracted", () => {
    const result = compileCss(`
      @layer utilities {
        .card { background-color: red; }
      }
    `);
    expect(result.ir.rules.length).toBe(1);
    expect(result.ir.rules[0]!.selector).toBe(".card");
    expect(result.ir.rules[0]!.properties.get("BackgroundColor3")).toEqual({
      type: "Color3",
      value: [255, 0, 0],
    });
  });

  test("multiple layers are all unwrapped", () => {
    const result = compileCss(`
      @layer base {
        .bg-white { background-color: white; }
      }
      @layer utilities {
        .text-black { color: black; }
      }
    `);
    expect(result.ir.rules.length).toBe(2);
  });

  test("nested @media inside @layer works", () => {
    const parsed = parseCSS(
      `@layer utilities {
        .card { padding: 8px; }
        @media (prefers-color-scheme: dark) {
          :root { --bg: black; }
        }
      }`,
      "test.css",
    );
    expect(parsed.rules.length).toBe(1); // .card rule
    expect(parsed.mediaRules.length).toBe(1); // dark mode media
  });

  test("rules outside @layer still work", () => {
    const result = compileCss(`
      .outside { background-color: blue; }
      @layer utilities {
        .inside { background-color: red; }
      }
    `);
    expect(result.ir.rules.length).toBe(2);
  });
});
