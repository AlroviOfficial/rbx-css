import { compile } from "../src/compiler.ts";
import type { CompileResult } from "../src/compiler.ts";

interface CompileTestOpts {
  name?: string;
  warnLevel?: "all" | "none";
  strict?: boolean;
}

/**
 * Compile a single CSS string for testing.
 * Accepts either a warnLevel string or an options object as the second argument.
 * Always disables base element rules so tests only see user-defined rules.
 */
export function compileCss(
  css: string,
  optsOrWarnLevel?: "all" | "none" | CompileTestOpts,
): CompileResult {
  const opts =
    typeof optsOrWarnLevel === "string"
      ? { warnLevel: optsOrWarnLevel }
      : optsOrWarnLevel;
  return compile([{ filename: "test.css", content: css }], {
    name: opts?.name ?? "Test",
    warnLevel: opts?.warnLevel ?? "none",
    strict: opts?.strict ?? false,
    includeBaseRules: false,
  });
}

/**
 * Compile multiple CSS sources for testing (multi-file scenarios).
 * Always disables base element rules so tests only see user-defined rules.
 */
export function compileMulti(
  sources: Array<{ filename: string; content: string }>,
  opts?: CompileTestOpts,
): CompileResult {
  return compile(sources, {
    name: opts?.name ?? "Test",
    warnLevel: opts?.warnLevel ?? "none",
    strict: opts?.strict ?? false,
    includeBaseRules: false,
  });
}
