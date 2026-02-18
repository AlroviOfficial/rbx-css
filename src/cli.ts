import { Command } from "commander";
import { readFileSync, writeFileSync } from "fs";
import { compile } from "./compiler.ts";
import { generateLuau } from "./codegen/luau.ts";
import { generateRBXMX } from "./codegen/rbxmx.ts";
import { generateManifest } from "./manifest.ts";
import { startWatch } from "./watch.ts";
import type { WarningLevel } from "./warnings.ts";

export function createCLI(): Command {
  const program = new Command();
  program
    .name("rbx-css")
    .description("CSS to Roblox StyleSheet compiler")
    .version("0.1.0");

  program
    .command("compile")
    .description("Compile CSS files to Roblox StyleSheet")
    .argument("<files...>", "CSS input files")
    .option("-o, --output <path>", "Output file path (.luau or .rbxmx)")
    .option("--name <name>", "StyleSheet name", "StyleSheet")
    .option("--format <format>", "Output format: luau or rbxmx")
    .option("--warn <level>", "Warning level: all, unsupported, none", "all")
    .option("--strict", "Treat warnings as errors", false)
    .option("--minify", "Minify Luau output", false)
    .option(
      "--tokens-sheet",
      "Emit tokens as a separate StyleSheet",
      false,
    )
    .option("--manifest", "Emit a .manifest.json alongside the output", false)
    .action(
      (
        files: string[],
        opts: {
          output?: string;
          name: string;
          format?: string;
          warn: string;
          strict: boolean;
          minify: boolean;
          tokensSheet: boolean;
          manifest: boolean;
        },
      ) => {
        handleCompile(files, opts);
      },
    );

  program
    .command("watch")
    .description("Watch CSS files and recompile on changes")
    .argument("<path>", "Directory or file to watch")
    .option("-o, --output <path>", "Output file path")
    .option("--name <name>", "StyleSheet name", "StyleSheet")
    .option("--format <format>", "Output format: luau or rbxmx")
    .option("--warn <level>", "Warning level", "all")
    .action(
      (
        watchPath: string,
        opts: {
          output?: string;
          name: string;
          format?: string;
          warn: string;
        },
      ) => {
        handleWatch(watchPath, opts);
      },
    );

  return program;
}

function handleCompile(
  files: string[],
  opts: {
    output?: string;
    name: string;
    format?: string;
    warn: string;
    strict: boolean;
    minify: boolean;
    manifest: boolean;
  },
): void {
  const sources = files.map((f) => ({
    filename: f,
    content: readFileSync(f, "utf-8"),
  }));

  const format = opts.format ?? inferFormat(opts.output);

  const result = compile(sources, {
    name: opts.name,
    warnLevel: opts.warn as WarningLevel,
    strict: opts.strict,
  });

  // Print warnings
  const warningText = result.warnings.format();
  if (warningText) {
    process.stderr.write(warningText + "\n");
  }

  if (result.warnings.hasErrors()) {
    process.exit(1);
  }

  // Generate output
  const output =
    format === "rbxmx"
      ? generateRBXMX(result.ir)
      : generateLuau(result.ir, {
          minify: opts.minify,
          sourceFile: files.join(", "),
        });

  if (opts.output) {
    writeFileSync(opts.output, output);
    console.log(`Written to ${opts.output}`);
  } else {
    process.stdout.write(output);
  }

  // Emit manifest alongside output
  if (opts.manifest && opts.output) {
    const manifest = generateManifest(result.overflowScrollClasses);
    const manifestPath = opts.output.replace(/\.(luau|rbxmx)$/, ".manifest.json");
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Manifest written to ${manifestPath}`);
  }
}

function handleWatch(
  watchPath: string,
  opts: {
    output?: string;
    name: string;
    format?: string;
    warn: string;
  },
): void {
  const format = opts.format ?? inferFormat(opts.output);

  const doCompile = (files: string[]) => {
    try {
      const sources = files.map((f) => ({
        filename: f,
        content: readFileSync(f, "utf-8"),
      }));

      const result = compile(sources, {
        name: opts.name,
        warnLevel: opts.warn as WarningLevel,
        strict: false,
      });

      const warningText = result.warnings.format();
      if (warningText) {
        process.stderr.write(warningText + "\n");
      }

      const output =
        format === "rbxmx"
          ? generateRBXMX(result.ir)
          : generateLuau(result.ir, {
              minify: false,
              sourceFile: files.join(", "),
            });

      if (opts.output) {
        writeFileSync(opts.output, output);
        console.log(`Compiled -> ${opts.output}`);
      } else {
        process.stdout.write(output);
      }
    } catch (err) {
      console.error("Compilation error:", err);
    }
  };

  startWatch(watchPath, doCompile);
}

function inferFormat(outputPath?: string): "luau" | "rbxmx" {
  if (!outputPath) return "luau";
  if (outputPath.endsWith(".rbxmx")) return "rbxmx";
  return "luau";
}
