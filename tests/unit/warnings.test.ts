import { describe, test, expect } from "bun:test";
import { compileCss } from "../helpers.ts";
import { WarningCollector } from "../../src/warnings.ts";

describe("warning collector", () => {
  test("warn level 'all' emits all warnings", () => {
    const collector = new WarningCollector("all");
    collector.warn({ code: "unsupported-property", message: "test" });
    collector.warn({ code: "partial-mapping", message: "test2" });
    expect(collector.getWarnings().length).toBe(2);
  });

  test("warn level 'unsupported' only emits unsupported-* codes", () => {
    const collector = new WarningCollector("unsupported");
    collector.warn({ code: "unsupported-property", message: "test" });
    collector.warn({ code: "unsupported-selector", message: "test2" });
    collector.warn({ code: "unsupported-unit", message: "test3" });
    collector.warn({ code: "partial-mapping", message: "should be filtered" });
    collector.warn({ code: "type-inference-ambiguous", message: "should be filtered" });
    expect(collector.getWarnings().length).toBe(3);
  });

  test("warn level 'none' emits nothing", () => {
    const collector = new WarningCollector("none");
    collector.warn({ code: "unsupported-property", message: "test" });
    expect(collector.getWarnings().length).toBe(0);
  });

  test("strict mode: hasErrors returns true when warnings exist", () => {
    const collector = new WarningCollector("all", true);
    collector.warn({ code: "unsupported-property", message: "test" });
    expect(collector.hasErrors()).toBe(true);
  });

  test("non-strict mode: hasErrors returns false even with warnings", () => {
    const collector = new WarningCollector("all", false);
    collector.warn({ code: "unsupported-property", message: "test" });
    expect(collector.hasErrors()).toBe(false);
  });

  test("format() produces correct output", () => {
    const collector = new WarningCollector("all");
    collector.warn({ code: "unsupported-property", message: "no equiv" });
    const output = collector.format();
    expect(output).toContain("[unsupported-property]");
    expect(output).toContain("no equiv");
    expect(output).toContain("warning:");
  });

  test("format() with file location", () => {
    const collector = new WarningCollector("all");
    collector.warn({
      code: "unsupported-property",
      message: "test",
      file: "styles.css",
      line: 10,
      column: 3,
    });
    const output = collector.format();
    expect(output).toContain("styles.css:10:3");
  });

  test("format() empty when no warnings", () => {
    const collector = new WarningCollector("all");
    expect(collector.format()).toBe("");
  });
});

describe("warning integration with compiler", () => {
  test("unsupported property: box-shadow", () => {
    const result = compileCss(`.a { box-shadow: 0 0 10px black; }`, "all");
    const msgs = result.warnings.getWarnings().map(w => w.message);
    expect(msgs.some(m => m.includes("box-shadow") || m.includes("no Roblox"))).toBe(true);
  });

  test("silently ignored property: text-decoration", () => {
    const result = compileCss(`.a { text-decoration: underline; }`, "all");
    // text-decoration has no Roblox equivalent, silently skipped
    expect(result.warnings.getWarnings().length).toBe(0);
  });

  test("silently ignored property: transition", () => {
    const result = compileCss(`.a { transition: all 0.3s ease; }`, "all");
    // transitions have no Roblox equivalent, silently skipped
    expect(result.warnings.getWarnings().length).toBe(0);
  });

  test("overflow: scroll emits partial-mapping warning", () => {
    const result = compileCss(`.a { overflow: scroll; }`, "all");
    expect(result.warnings.getWarnings().some(w => w.code === "partial-mapping")).toBe(true);
  });

  test("position and cursor are silently ignored (no warnings)", () => {
    const result = compileCss(`.a { position: absolute; cursor: pointer; }`, "all");
    expect(result.warnings.getWarnings().length).toBe(0);
  });

  test("strict mode with warnings fails compilation", () => {
    const result = compileCss(`.a { box-shadow: 0 0 5px black; }`, { warnLevel: "all", strict: true });
    expect(result.warnings.hasErrors()).toBe(true);
  });
});
